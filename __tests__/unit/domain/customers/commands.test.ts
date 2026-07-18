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
  () => Promise<{
    id: string;
    isActive?: boolean;
    userId?: string | null;
  } | null>
>(() => Promise.resolve(null));

const mockCustomerFindFirst = mock<
  () => Promise<{ id: string; userId?: string | null } | null>
>(() => Promise.resolve(null));

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

// `updateCustomerProfileByUserId` は interactive transaction を使うため、
// mock の `$transaction(callback)` はコールバックに tx を渡して即時実行する
// (customer.findUniqueOrThrow / update が同じモック関数を通るように tx も
// 同一の customer プロキシを共有する)。
const mockCustomerFindUniqueOrThrow = mock<
  () => Promise<{ id: string; email: string | null }>
>(() => Promise.resolve({ id: "customer-1", email: null }));

const prismaCustomer = {
  findUnique: mockCustomerFindUnique,
  findUniqueOrThrow: mockCustomerFindUniqueOrThrow,
  findFirst: mockCustomerFindFirst,
  create: mockCustomerCreate,
  update: mockCustomerUpdate,
  delete: mockCustomerDelete,
};

// SETTINGS-02: 初回 email 登録 uniqueness チェックは Better Auth の User.email
// (`prisma.user.findFirst`) と Customer.emailCanonical の両方を tx 内で照会する。
const mockUserFindFirst = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);

const prismaUser = {
  findFirst: mockUserFindFirst,
};

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: prismaCustomer,
    user: prismaUser,
    $transaction: <T>(
      fn: (tx: {
        customer: typeof prismaCustomer;
        user: typeof prismaUser;
      }) => Promise<T>,
    ) => fn({ customer: prismaCustomer, user: prismaUser }),
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
    mockCustomerFindUniqueOrThrow.mockReset();
    mockCustomerFindFirst.mockReset();
    mockCustomerCreate.mockReset();
    mockCustomerUpdate.mockReset();
    mockCustomerDelete.mockReset();
    mockUserFindFirst.mockReset();

    // デフォルト: 顧客が存在しない
    mockCustomerFindUnique.mockResolvedValue(null);
    // updateCustomerProfileByUserId の tx.customer.findUniqueOrThrow に対する既定応答:
    // 「LINE OAuth 顧客で email が未登録」ケースを模す (email 初回登録テストの前提)。
    mockCustomerFindUniqueOrThrow.mockResolvedValue({
      id: CUSTOMER_ID,
      email: null,
    });
    mockCustomerFindFirst.mockResolvedValue(null);
    mockCustomerCreate.mockResolvedValue({ id: "customer-1" });
    mockCustomerUpdate.mockResolvedValue({ id: CUSTOMER_ID });
    mockCustomerDelete.mockResolvedValue({ id: CUSTOMER_ID });
    mockUserFindFirst.mockResolvedValue(null);
  });

  // =============================================================================
  // createCustomer
  // =============================================================================

  describe("createCustomer", () => {
    describe("正常系", () => {
      test("新規メールアドレスで顧客を作成できる", async () => {
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
              emailCanonical: "tanaka@example.com",
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

    describe("重複メール", () => {
      test("未リンク顧客の重複がなければ同じメールアドレスでも別顧客として作成できる", async () => {
        mockCustomerFindFirst.mockResolvedValueOnce(null);
        mockCustomerCreate.mockResolvedValueOnce({ id: "duplicate-customer" });

        await expect(createCustomer(VALID_CUSTOMER_DATA)).resolves.toEqual({
          id: "duplicate-customer",
        });
        expect(mockCustomerCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              email: "tanaka@example.com",
              emailCanonical: "tanaka@example.com",
            }),
          }),
        );
      });

      test("同じ canonical email の未リンク顧客が存在する場合は CONFLICT を返す", async () => {
        mockCustomerFindFirst.mockResolvedValueOnce({ id: "guest-customer" });

        await expect(createCustomer(VALID_CUSTOMER_DATA)).rejects.toMatchObject(
          {
            code: "CONFLICT",
            message:
              "同じメールアドレスの未リンク顧客が既に存在します。既存顧客を編集するか、顧客マージを行ってください。",
          },
        );
        expect(mockCustomerCreate).not.toHaveBeenCalled();
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
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          isActive: true,
          userId: null,
        });
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
              emailCanonical: "tanaka@example.com",
            }),
          }),
        );
      });

      test("同じメールアドレスで更新できる", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          isActive: true,
          userId: null,
        });
        mockCustomerFindFirst.mockResolvedValueOnce(null);

        await expect(
          updateCustomer(CUSTOMER_ID, VALID_CUSTOMER_DATA),
        ).resolves.toBeUndefined();

        expect(mockCustomerFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              emailCanonical: "tanaka@example.com",
              userId: null,
              NOT: { id: CUSTOMER_ID },
            }),
          }),
        );
        expect(mockCustomerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              email: VALID_CUSTOMER_DATA.email,
              emailCanonical: "tanaka@example.com",
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

      test("リンク済み顧客は他の顧客が使用中のメールアドレスでも更新できる", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          isActive: true,
          userId: USER_ID,
        });
        mockCustomerFindFirst.mockResolvedValueOnce({ id: "other-customer" });

        await expect(
          updateCustomer(CUSTOMER_ID, VALID_CUSTOMER_DATA),
        ).resolves.toBeUndefined();
        expect(mockCustomerFindFirst).not.toHaveBeenCalled();
      });

      test("未リンク顧客を同じ canonical email の未リンク顧客へ重複更新できない", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          isActive: true,
          userId: null,
        });
        mockCustomerFindFirst.mockResolvedValueOnce({ id: "other-guest" });

        await expect(
          updateCustomer(CUSTOMER_ID, VALID_CUSTOMER_DATA),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message:
            "同じメールアドレスの未リンク顧客が既に存在します。既存顧客を編集するか、顧客マージを行ってください。",
        });
        expect(mockCustomerUpdate).not.toHaveBeenCalled();
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

    // -------------------------------------------------------------------------
    // SETTINGS-02: 初回 email 登録 uniqueness チェック
    // -------------------------------------------------------------------------
    // 修正前は「所有権検証も一意性チェックも無い」ため、第三者の既存 email を
    // Customer.email に設定できてしまう問題があった。所有権検証 (verification
    // link) は followup PR で実装するが、uniqueness チェックだけでも
    // 「既に別ユーザーが使っている email を奪える」問題は塞がる。
    describe("SETTINGS-02: 初回 email 登録 uniqueness", () => {
      test("email 未登録顧客が新規 email を登録できる (競合なし)", async () => {
        // 現 email が空 → 初回登録経路
        mockCustomerFindUniqueOrThrow.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          email: null,
        });
        // User / Customer 側とも競合なし
        mockUserFindFirst.mockResolvedValueOnce(null);
        mockCustomerFindFirst.mockResolvedValueOnce(null);

        await expect(
          updateCustomerProfileByUserId(USER_ID, {
            customerType: CustomerType.PERSONAL,
            lastName: "山田",
            firstName: "花子",
            companyName: null,
            phoneNumber: null,
            email: "new@example.com",
          }),
        ).resolves.toBeUndefined();

        expect(mockCustomerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              email: "new@example.com",
              emailCanonical: "new@example.com",
            }),
          }),
        );
      });

      test("同 email の別 User (Better Auth) が存在する場合 CONFLICT", async () => {
        mockCustomerFindUniqueOrThrow.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          email: null,
        });
        // 他人が既に Better Auth 側 (User.email) で登録済み
        mockUserFindFirst.mockResolvedValueOnce({ id: "other-user-id" });
        mockCustomerFindFirst.mockResolvedValueOnce(null);

        await expect(
          updateCustomerProfileByUserId(USER_ID, {
            customerType: CustomerType.PERSONAL,
            lastName: "山田",
            firstName: "花子",
            companyName: null,
            phoneNumber: null,
            email: "taken@example.com",
          }),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: "このメールアドレスは既に使用されています",
        });
        expect(mockCustomerUpdate).not.toHaveBeenCalled();
      });

      test("同 canonical email の別 Customer が存在する場合 CONFLICT", async () => {
        mockCustomerFindUniqueOrThrow.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          email: null,
        });
        mockUserFindFirst.mockResolvedValueOnce(null);
        // 他 Customer (guest 含む) が同 canonical email を保持
        mockCustomerFindFirst.mockResolvedValueOnce({ id: "other-customer" });

        await expect(
          updateCustomerProfileByUserId(USER_ID, {
            customerType: CustomerType.PERSONAL,
            lastName: "山田",
            firstName: "花子",
            companyName: null,
            phoneNumber: null,
            email: "guest-used@example.com",
          }),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: "このメールアドレスは既に使用されています",
        });
        expect(mockCustomerUpdate).not.toHaveBeenCalled();
      });

      test("大文字混在の入力でも canonical (小文字) で uniqueness チェックが走る", async () => {
        mockCustomerFindUniqueOrThrow.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          email: null,
        });
        mockUserFindFirst.mockResolvedValueOnce(null);
        mockCustomerFindFirst.mockResolvedValueOnce(null);

        await updateCustomerProfileByUserId(USER_ID, {
          customerType: CustomerType.PERSONAL,
          lastName: "山田",
          firstName: "花子",
          companyName: null,
          phoneNumber: null,
          email: "Mixed.Case@Example.COM",
        });

        // User 側は case-insensitive で canonical 値を照会
        expect(mockUserFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              email: { equals: "mixed.case@example.com", mode: "insensitive" },
              NOT: { id: USER_ID },
            }),
          }),
        );
        // Customer 側は emailCanonical (小文字) と自レコード除外
        expect(mockCustomerFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              emailCanonical: "mixed.case@example.com",
              NOT: { id: CUSTOMER_ID },
            }),
          }),
        );
      });

      test("email を渡さない場合は uniqueness チェックを走らせない", async () => {
        mockCustomerFindUniqueOrThrow.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          email: "existing@example.com",
        });

        await updateCustomerProfileByUserId(USER_ID, {
          customerType: CustomerType.PERSONAL,
          lastName: "山田",
          firstName: "花子",
          companyName: null,
          phoneNumber: null,
        });

        expect(mockUserFindFirst).not.toHaveBeenCalled();
        expect(mockCustomerFindFirst).not.toHaveBeenCalled();
      });

      test("既に email 登録済み顧客が email を渡すと VALIDATION (uniqueness は走らない)", async () => {
        mockCustomerFindUniqueOrThrow.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          email: "existing@example.com",
        });

        await expect(
          updateCustomerProfileByUserId(USER_ID, {
            customerType: CustomerType.PERSONAL,
            lastName: "山田",
            firstName: "花子",
            companyName: null,
            phoneNumber: null,
            email: "attacker@example.com",
          }),
        ).rejects.toMatchObject({
          code: "VALIDATION",
        });

        // shouldRegisterEmail=false なので uniqueness チェックまで到達しない
        expect(mockUserFindFirst).not.toHaveBeenCalled();
        expect(mockCustomerFindFirst).not.toHaveBeenCalled();
        expect(mockCustomerUpdate).not.toHaveBeenCalled();
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
