import { describe, test, expect, mock, beforeEach } from "bun:test";

// CustomerStatus 定数（@generated/prisma/enums から Prisma enum を再現）
const CustomerStatus = {
  NEW: "NEW",
  REGULAR: "REGULAR",
  VIP: "VIP",
  INACTIVE: "INACTIVE",
  BLACKLIST: "BLACKLIST",
} as const;
type CustomerStatus = (typeof CustomerStatus)[keyof typeof CustomerStatus];

// CustomerType 定数
const CustomerType = {
  PERSONAL: "PERSONAL",
  CORPORATE: "CORPORATE",
} as const;

// Prisma モック関数（mock.module より先に定義）
const mockCustomerFindUnique = mock<
  () => Promise<{ id: string; isActive: boolean } | null>
>(() => Promise.resolve(null));

const mockCustomerFindFirst = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);

const mockCustomerCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "customer-1" }),
);

const mockCustomerUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "customer-1" }),
);

const mockCustomerDelete = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "customer-1" }),
);

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      findUnique: mockCustomerFindUnique,
      findFirst: mockCustomerFindFirst,
      create: mockCustomerCreate,
      update: mockCustomerUpdate,
      delete: mockCustomerDelete,
    },
  },
}));

mock.module("@generated/prisma/enums", () => ({
  CustomerStatus,
  CustomerType,
}));

import { DomainError } from "@/shared/domain/domain-error";
import {
  createCustomer,
  updateCustomerStatus,
  updateCustomerNotes,
  toggleCustomerActive,
  updateCustomer,
  updateCustomerProfileByUserId,
  deleteCustomer,
} from "@/shared/domain/customers/commands";

// テストデータ
const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "660e8400-e29b-41d4-a716-446655440000";

const VALID_CUSTOMER_DATA = {
  customerType: CustomerType.PERSONAL,
  lastName: "田中",
  firstName: "太郎",
  lastNameKana: "タナカ",
  firstNameKana: "タロウ",
  companyName: "株式会社テスト",
  email: "tanaka@example.com",
  phoneNumber: "090-1234-5678",
  postalCode: "150-0001",
  prefecture: "東京都",
  city: "渋谷区",
  streetAddress: "神宮前1-1-1",
  building: "サンプルビル 2F",
  notes: "VIP顧客",
  marketingOptIn: false,
  phoneContactOptIn: true,
} as const;

describe("customers/commands", () => {
  beforeEach(() => {
    mockCustomerFindUnique.mockReset();
    mockCustomerFindFirst.mockReset();
    mockCustomerCreate.mockReset();
    mockCustomerUpdate.mockReset();
    mockCustomerDelete.mockReset();

    // デフォルト: 顧客が存在しない
    mockCustomerFindUnique.mockResolvedValue(null);
    mockCustomerFindFirst.mockResolvedValue(null);
    mockCustomerCreate.mockResolvedValue({ id: "customer-1" });
    mockCustomerUpdate.mockResolvedValue({ id: CUSTOMER_ID });
    mockCustomerDelete.mockResolvedValue({ id: CUSTOMER_ID });
  });

  // =============================================================================
  // createCustomer
  // =============================================================================

  describe("createCustomer", () => {
    describe("正常系", () => {
      test("新規メールアドレスで顧客を作成できる", async () => {
        // メール重複チェックで null（使用可能）
        mockCustomerFindUnique.mockResolvedValueOnce(null);
        mockCustomerCreate.mockResolvedValueOnce({ id: "new-customer-id" });

        const result = await createCustomer(VALID_CUSTOMER_DATA);

        expect(result).toEqual({ id: "new-customer-id" });
        expect(mockCustomerCreate).toHaveBeenCalledTimes(1);
      });

      test("create が CustomerStatus.NEW と isActive:true で呼ばれる", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce(null);
        mockCustomerCreate.mockResolvedValueOnce({ id: "customer-1" });

        await createCustomer(VALID_CUSTOMER_DATA);

        expect(mockCustomerCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: CustomerStatus.NEW,
              isActive: true,
              lastName: "田中",
              firstName: "太郎",
              email: "tanaka@example.com",
            }),
          }),
        );
      });

      test("省略可能フィールドが空文字の場合は null に変換される", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce(null);
        mockCustomerCreate.mockResolvedValueOnce({ id: "customer-1" });

        await createCustomer({
          ...VALID_CUSTOMER_DATA,
          lastNameKana: "",
          firstNameKana: "",
          companyName: "",
          phoneNumber: "",
          postalCode: "",
          prefecture: "",
          city: "",
          streetAddress: "",
          building: "",
          notes: "",
        });

        expect(mockCustomerCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              lastNameKana: null,
              firstNameKana: null,
              companyName: null,
              phoneNumber: null,
              postalCode: null,
              prefecture: null,
              city: null,
              streetAddress: null,
              building: null,
              notes: null,
            }),
          }),
        );
      });
    });

    describe("異常系", () => {
      test("既存のメールアドレスで CONFLICT エラーをスローする", async () => {
        // メール重複チェックで既存顧客を返す
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: "existing-id",
          isActive: true,
        });

        await expect(createCustomer(VALID_CUSTOMER_DATA)).rejects.toMatchObject(
          {
            code: "CONFLICT",
            message: "このメールアドレスは既に登録されています",
          },
        );
      });
    });
  });

  // =============================================================================
  // updateCustomerStatus
  // =============================================================================

  describe("updateCustomerStatus", () => {
    describe("正常系", () => {
      test("存在する顧客のステータスを更新できる", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          isActive: true,
        });

        await expect(
          updateCustomerStatus(CUSTOMER_ID, CustomerStatus.REGULAR),
        ).resolves.toBeUndefined();

        expect(mockCustomerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: CUSTOMER_ID },
            data: { status: CustomerStatus.REGULAR },
          }),
        );
      });

      test("各ステータス値で更新できる", async () => {
        for (const status of Object.values(CustomerStatus)) {
          mockCustomerFindUnique.mockResolvedValueOnce({
            id: CUSTOMER_ID,
            isActive: true,
          });
          mockCustomerUpdate.mockResolvedValueOnce({ id: CUSTOMER_ID });

          await expect(
            updateCustomerStatus(CUSTOMER_ID, status),
          ).resolves.toBeUndefined();
        }
      });
    });

    describe("異常系", () => {
      test("存在しない顧客 ID で NOT_FOUND エラーをスローする", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce(null);

        await expect(
          updateCustomerStatus(CUSTOMER_ID, CustomerStatus.VIP),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "顧客が見つかりません",
        });
      });
    });
  });

  // =============================================================================
  // updateCustomerNotes
  // =============================================================================

  describe("updateCustomerNotes", () => {
    describe("正常系", () => {
      test("存在する顧客のメモを更新できる", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          isActive: true,
        });

        await expect(
          updateCustomerNotes(CUSTOMER_ID, "新しいメモ"),
        ).resolves.toBeUndefined();

        expect(mockCustomerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: CUSTOMER_ID },
            data: { notes: "新しいメモ" },
          }),
        );
      });

      test("null でメモをクリアできる", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          isActive: true,
        });

        await expect(
          updateCustomerNotes(CUSTOMER_ID, null),
        ).resolves.toBeUndefined();

        expect(mockCustomerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { notes: null },
          }),
        );
      });
    });

    describe("異常系", () => {
      test("存在しない顧客 ID で NOT_FOUND エラーをスローする", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce(null);

        await expect(
          updateCustomerNotes(CUSTOMER_ID, "メモ"),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "顧客が見つかりません",
        });
      });
    });
  });

  // =============================================================================
  // toggleCustomerActive
  // =============================================================================

  describe("toggleCustomerActive", () => {
    describe("正常系", () => {
      test("アクティブな顧客を非アクティブにできる", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          isActive: true,
        });

        await expect(
          toggleCustomerActive(CUSTOMER_ID),
        ).resolves.toBeUndefined();

        expect(mockCustomerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: CUSTOMER_ID },
            data: { isActive: false },
          }),
        );
      });

      test("非アクティブな顧客をアクティブにできる", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          isActive: false,
        });

        await expect(
          toggleCustomerActive(CUSTOMER_ID),
        ).resolves.toBeUndefined();

        expect(mockCustomerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: CUSTOMER_ID },
            data: { isActive: true },
          }),
        );
      });
    });

    describe("異常系", () => {
      test("存在しない顧客 ID で NOT_FOUND エラーをスローする", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce(null);

        await expect(toggleCustomerActive(CUSTOMER_ID)).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "顧客が見つかりません",
        });
      });
    });
  });

  // =============================================================================
  // updateCustomer
  // =============================================================================

  describe("updateCustomer", () => {
    describe("正常系", () => {
      test("存在する顧客の情報を更新できる", async () => {
        // ensureCustomerExists: 顧客が存在する
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          isActive: true,
        });
        // ensureEmailAvailable: 他の顧客はメールを使っていない
        mockCustomerFindFirst.mockResolvedValueOnce(null);

        await expect(
          updateCustomer(CUSTOMER_ID, VALID_CUSTOMER_DATA),
        ).resolves.toBeUndefined();

        expect(mockCustomerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: CUSTOMER_ID },
            data: expect.objectContaining({
              lastName: "田中",
              firstName: "太郎",
              email: "tanaka@example.com",
            }),
          }),
        );
      });

      test("同じメールアドレスで自分自身を更新できる（重複チェックが currentId を除外）", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          isActive: true,
        });
        // findFirst で自分自身を除いた重複チェック → 結果なし
        mockCustomerFindFirst.mockResolvedValueOnce(null);

        await expect(
          updateCustomer(CUSTOMER_ID, VALID_CUSTOMER_DATA),
        ).resolves.toBeUndefined();

        expect(mockCustomerFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              email: VALID_CUSTOMER_DATA.email,
              NOT: { id: CUSTOMER_ID },
            }),
          }),
        );
      });
    });

    describe("異常系", () => {
      test("存在しない顧客 ID で NOT_FOUND エラーをスローする", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce(null);

        await expect(
          updateCustomer(CUSTOMER_ID, VALID_CUSTOMER_DATA),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "顧客が見つかりません",
        });
      });

      test("他の顧客が使用中のメールアドレスで CONFLICT エラーをスローする", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          isActive: true,
        });
        // 他の顧客がそのメールを使用中
        mockCustomerFindFirst.mockResolvedValueOnce({ id: "other-customer" });

        await expect(
          updateCustomer(CUSTOMER_ID, VALID_CUSTOMER_DATA),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: "このメールアドレスは既に登録されています",
        });
      });
    });
  });

  // =============================================================================
  // updateCustomerProfileByUserId
  // =============================================================================

  describe("updateCustomerProfileByUserId", () => {
    describe("正常系", () => {
      test("userId を使ってプロフィールを更新できる", async () => {
        await expect(
          updateCustomerProfileByUserId(USER_ID, {
            customerType: CustomerType.PERSONAL,
            lastName: "山田",
            firstName: "花子",
            companyName: null,
            phoneNumber: "080-9876-5432",
          }),
        ).resolves.toBeUndefined();

        expect(mockCustomerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { userId: USER_ID },
            data: {
              customerType: CustomerType.PERSONAL,
              lastName: "山田",
              firstName: "花子",
              companyName: null,
              phoneNumber: "080-9876-5432",
            },
          }),
        );
      });

      test("phoneNumber が null の場合も更新できる", async () => {
        await expect(
          updateCustomerProfileByUserId(USER_ID, {
            customerType: CustomerType.PERSONAL,
            lastName: "山田",
            firstName: "花子",
            companyName: null,
            phoneNumber: null,
          }),
        ).resolves.toBeUndefined();

        expect(mockCustomerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              customerType: CustomerType.PERSONAL,
              lastName: "山田",
              firstName: "花子",
              companyName: null,
              phoneNumber: null,
            },
          }),
        );
      });
    });
  });

  // =============================================================================
  // deleteCustomer
  // =============================================================================

  describe("deleteCustomer", () => {
    describe("正常系", () => {
      test("存在する顧客を削除できる", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          isActive: true,
        });

        await expect(deleteCustomer(CUSTOMER_ID)).resolves.toBeUndefined();

        expect(mockCustomerDelete).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: CUSTOMER_ID },
          }),
        );
      });
    });

    describe("異常系", () => {
      test("存在しない顧客 ID で NOT_FOUND エラーをスローする", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce(null);

        await expect(deleteCustomer(CUSTOMER_ID)).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "顧客が見つかりません",
        });

        expect(mockCustomerDelete).not.toHaveBeenCalled();
      });
    });
  });
});
