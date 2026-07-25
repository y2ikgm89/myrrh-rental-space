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

const EmailDeliveryStatus = {
  OK: "OK",
  SOFT_BOUNCED: "SOFT_BOUNCED",
  HARD_BOUNCED: "HARD_BOUNCED",
  COMPLAINED: "COMPLAINED",
} as const;

// Prisma モック関数（mock.module より先に定義）
const mockCustomerFindUnique = mock<
  () => Promise<{
    id?: string;
    isActive?: boolean;
    userId?: string | null;
    anonymizedAt?: Date | null;
    status?: CustomerStatus;
    lastName?: string;
    firstName?: string;
    lastNameKana?: string | null;
    firstNameKana?: string | null;
    companyName?: string | null;
    customerType?: string;
    email?: string;
    emailCanonical?: string;
    phoneNumber?: string | null;
    postalCode?: string | null;
    prefecture?: string | null;
    city?: string | null;
    streetAddress?: string | null;
    building?: string | null;
    notes?: string | null;
    marketingOptIn?: boolean;
    phoneContactOptIn?: boolean;
    emailDeliveryStatus?: string;
    suppressedEmailHash?: string | null;
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

const mockUserDelete = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "user-1" }),
);

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

// SETTINGS-02 followup: verification-based initial-email registration の
// command 群 (`requestCustomerEmailChangeCommand` / `consumeCustomerEmailChangeCommand`)
// は `pendingCustomerEmailChange` テーブルにも書き込む。unit テストの mock は
// 「実書き込みは検証せず、シグネチャと分岐のみ検証する」方針とし、findUnique /
// findFirst / create / update / deleteMany を no-op mock で足す。
const mockCustomerFindUniqueOrThrow = mock<
  () => Promise<{ id: string; email: string | null }>
>(() => Promise.resolve({ id: "customer-1", email: null }));

const mockPendingCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "pending-1" }),
);
const mockPendingDeleteMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);
const mockPendingFindUnique = mock<
  () => Promise<{
    id: string;
    customerId: string;
    newEmail: string;
    newEmailCanonical: string;
    expiresAt: Date;
    consumedAt: Date | null;
  } | null>
>(() => Promise.resolve(null));
const mockPendingUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "pending-1" }),
);

// Better Auth 側 User.email との衝突チェック用 (main SETTINGS-02 と同じ scope)。
const mockUserFindFirst = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);
const mockUserUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "user-1" }),
);

const prismaCustomer = {
  findUnique: mockCustomerFindUnique,
  findUniqueOrThrow: mockCustomerFindUniqueOrThrow,
  findFirst: mockCustomerFindFirst,
  create: mockCustomerCreate,
  update: mockCustomerUpdate,
};

const prismaPending = {
  create: mockPendingCreate,
  deleteMany: mockPendingDeleteMany,
  findUnique: mockPendingFindUnique,
  update: mockPendingUpdate,
};

const prismaUser = {
  findFirst: mockUserFindFirst,
  delete: mockUserDelete,
  update: mockUserUpdate,
};

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: prismaCustomer,
    pendingCustomerEmailChange: prismaPending,
    user: prismaUser,
    $transaction: <T>(
      fn: (tx: {
        customer: typeof prismaCustomer;
        pendingCustomerEmailChange: typeof prismaPending;
        user: typeof prismaUser;
      }) => Promise<T>,
    ) =>
      fn({
        customer: prismaCustomer,
        pendingCustomerEmailChange: prismaPending,
        user: prismaUser,
      }),
  },
}));

mock.module("@generated/prisma/enums", () => ({
  CustomerStatus,
  CustomerType,
  EmailDeliveryStatus,
}));

mock.module("@/shared/domain/customers/queries", () => ({
  hashSuppressedEmailCandidate: (email: string) => `hash:${email}`,
}));

import { DomainError } from "@/shared/domain/domain-error";
import {
  anonymizeCustomerCommand,
  consumeCustomerEmailChangeCommand,
  createCustomer,
  updateCustomerStatus,
  updateCustomerNotes,
  toggleCustomerActive,
  updateCustomer,
  updateCustomerProfileByUserId,
  requestCustomerEmailChangeCommand,
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
    mockUserDelete.mockReset();
    mockPendingCreate.mockReset();
    mockPendingDeleteMany.mockReset();
    mockPendingFindUnique.mockReset();
    mockPendingUpdate.mockReset();
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
    mockUserDelete.mockResolvedValue({ id: USER_ID });
    mockPendingCreate.mockResolvedValue({ id: "pending-1" });
    mockPendingDeleteMany.mockResolvedValue({ count: 0 });
    mockPendingFindUnique.mockResolvedValue(null);
    mockPendingUpdate.mockResolvedValue({ id: "pending-1" });
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
          status: CustomerStatus.NEW,
        });

        await expect(
          updateCustomerStatus(CUSTOMER_ID, CustomerStatus.REGULAR),
        ).resolves.toEqual({ previousStatus: CustomerStatus.NEW });

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
            status: CustomerStatus.NEW,
          });
          mockCustomerUpdate.mockResolvedValueOnce({ id: CUSTOMER_ID });

          await expect(
            updateCustomerStatus(CUSTOMER_ID, status),
          ).resolves.toEqual({ previousStatus: CustomerStatus.NEW });
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
          notes: "旧メモ",
        });

        await expect(
          updateCustomerNotes(CUSTOMER_ID, "新しいメモ"),
        ).resolves.toEqual({ previousNotes: "旧メモ" });

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
          notes: "既存メモ",
        });

        await expect(updateCustomerNotes(CUSTOMER_ID, null)).resolves.toEqual({
          previousNotes: "既存メモ",
        });

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

        await expect(toggleCustomerActive(CUSTOMER_ID)).resolves.toEqual({
          previousActive: true,
        });

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

        await expect(toggleCustomerActive(CUSTOMER_ID)).resolves.toEqual({
          previousActive: false,
        });

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
          userId: null,
          lastName: "旧姓",
        });
        mockCustomerFindFirst.mockResolvedValueOnce(null);

        await expect(
          updateCustomer(CUSTOMER_ID, VALID_CUSTOMER_DATA),
        ).resolves.toMatchObject({ previous: { lastName: "旧姓" } });

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
          userId: null,
          lastName: "旧姓",
        });
        mockCustomerFindFirst.mockResolvedValueOnce(null);

        await expect(
          updateCustomer(CUSTOMER_ID, VALID_CUSTOMER_DATA),
        ).resolves.toMatchObject({ previous: { lastName: "旧姓" } });

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
          userId: USER_ID,
          lastName: "旧姓",
          emailCanonical: "old@example.com",
          emailDeliveryStatus: "OK",
          suppressedEmailHash: null,
        });
        mockCustomerFindFirst.mockResolvedValueOnce({ id: "other-customer" });

        await expect(
          updateCustomer(CUSTOMER_ID, VALID_CUSTOMER_DATA),
        ).resolves.toMatchObject({ previous: { lastName: "旧姓" } });
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
            marketingOptIn: true,
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
              marketingOptIn: true,
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
            marketingOptIn: false,
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
              marketingOptIn: false,
            },
          }),
        );
      });
    });
  });

  // =============================================================================
  // requestCustomerEmailChangeCommand (SETTINGS-02 followup)
  // =============================================================================

  describe("requestCustomerEmailChangeCommand", () => {
    describe("正常系", () => {
      test("email 未登録の顧客に対して pending 行が作成され raw token が返る", async () => {
        mockCustomerFindUniqueOrThrow.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          email: null,
        });
        mockCustomerFindFirst.mockResolvedValueOnce(null);

        const result = await requestCustomerEmailChangeCommand(
          USER_ID,
          "new@example.com",
        );

        expect(result.customerId).toBe(CUSTOMER_ID);
        expect(typeof result.rawToken).toBe("string");
        expect(result.rawToken.length).toBeGreaterThan(0);
        expect(result.expiresAt).toBeInstanceOf(Date);
        expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

        // 既存 pending を削除してから新規作成する契約
        expect(mockPendingDeleteMany).toHaveBeenCalledWith({
          where: { customerId: CUSTOMER_ID, consumedAt: null },
        });
        expect(mockPendingCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              customerId: CUSTOMER_ID,
              newEmail: "new@example.com",
              newEmailCanonical: "new@example.com",
            }),
          }),
        );

        // uniqueness ガード: 全 Customer の canonical を探しに行っている
        // (main SETTINGS-02 のスコープ = linked/guest 両方を対象)。
        expect(mockCustomerFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              emailCanonical: "new@example.com",
              NOT: { id: CUSTOMER_ID },
            }),
          }),
        );
        // Better Auth User.email 側も case-insensitive で照会する
        expect(mockUserFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              email: {
                equals: "new@example.com",
                mode: "insensitive",
              },
              NOT: { id: USER_ID },
            }),
          }),
        );
      });

      test("tokenHash は raw token と一致せず (hash されている)", async () => {
        mockCustomerFindUniqueOrThrow.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          email: null,
        });
        mockCustomerFindFirst.mockResolvedValueOnce(null);

        const result = await requestCustomerEmailChangeCommand(
          USER_ID,
          "hash-check@example.com",
        );

        // pending 行に書き込まれた tokenHash が raw と別物 (sha256 hex 64 文字) で、
        // かつ長さも raw と異なることを検証。
        expect(mockPendingCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              tokenHash: expect.not.stringMatching(
                new RegExp(`^${result.rawToken}$`),
              ),
            }),
          }),
        );
        expect(mockPendingCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
            }),
          }),
        );
      });
    });

    describe("異常系", () => {
      test("空文字入力は VALIDATION でエラーになる", async () => {
        await expect(
          requestCustomerEmailChangeCommand(USER_ID, "   "),
        ).rejects.toMatchObject({
          code: "VALIDATION",
        });
        expect(mockPendingCreate).not.toHaveBeenCalled();
      });

      test("既に Customer.email が設定済みなら VALIDATION でエラー", async () => {
        mockCustomerFindUniqueOrThrow.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          email: "already@example.com",
        });

        await expect(
          requestCustomerEmailChangeCommand(USER_ID, "new@example.com"),
        ).rejects.toMatchObject({
          code: "VALIDATION",
          message:
            "メールアドレスは既に登録済みです。変更するには別の手続きが必要です。",
        });
        expect(mockPendingCreate).not.toHaveBeenCalled();
      });

      test("他の Customer が同じ canonical email を持つなら CONFLICT (未リンク・リンク済問わず)", async () => {
        mockCustomerFindUniqueOrThrow.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          email: null,
        });
        mockUserFindFirst.mockResolvedValueOnce(null);
        mockCustomerFindFirst.mockResolvedValueOnce({ id: "other-customer" });

        await expect(
          requestCustomerEmailChangeCommand(USER_ID, "conflict@example.com"),
        ).rejects.toMatchObject({
          code: "CONFLICT",
        });
        expect(mockPendingCreate).not.toHaveBeenCalled();
      });

      test("Better Auth User.email に同じ email がある場合も CONFLICT", async () => {
        mockCustomerFindUniqueOrThrow.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          email: null,
        });
        mockUserFindFirst.mockResolvedValueOnce({ id: "other-user-id" });
        mockCustomerFindFirst.mockResolvedValueOnce(null);

        await expect(
          requestCustomerEmailChangeCommand(USER_ID, "taken@example.com"),
        ).rejects.toMatchObject({
          code: "CONFLICT",
        });
        expect(mockPendingCreate).not.toHaveBeenCalled();
      });

      test("大文字混在入力でも canonical (小文字) + case-insensitive で uniqueness をチェック", async () => {
        mockCustomerFindUniqueOrThrow.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          email: null,
        });
        mockUserFindFirst.mockResolvedValueOnce(null);
        mockCustomerFindFirst.mockResolvedValueOnce(null);

        await requestCustomerEmailChangeCommand(
          USER_ID,
          "Mixed.Case@Example.COM",
        );

        expect(mockUserFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              email: {
                equals: "mixed.case@example.com",
                mode: "insensitive",
              },
              NOT: { id: USER_ID },
            }),
          }),
        );
        expect(mockCustomerFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              emailCanonical: "mixed.case@example.com",
              NOT: { id: CUSTOMER_ID },
            }),
          }),
        );
      });
    });
  });

  // =============================================================================
  // consumeCustomerEmailChangeCommand (SETTINGS-02 followup)
  // =============================================================================

  describe("consumeCustomerEmailChangeCommand", () => {
    const RAW_TOKEN = "sample-raw-token";

    describe("正常系", () => {
      test("有効な token で Customer.email が更新され pending は consumed になる", async () => {
        mockPendingFindUnique.mockResolvedValueOnce({
          id: "pending-1",
          customerId: CUSTOMER_ID,
          newEmail: "verified@example.com",
          newEmailCanonical: "verified@example.com",
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        });
        mockCustomerFindFirst.mockResolvedValueOnce(null);

        const result = await consumeCustomerEmailChangeCommand(RAW_TOKEN);

        expect(result).toEqual({
          customerId: CUSTOMER_ID,
          newEmail: "verified@example.com",
        });

        // consumedAt を先にマークしてから Customer.email を書く
        expect(mockPendingUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "pending-1" },
            data: expect.objectContaining({ consumedAt: expect.any(Date) }),
          }),
        );
        expect(mockCustomerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: CUSTOMER_ID },
            data: {
              email: "verified@example.com",
              emailCanonical: "verified@example.com",
            },
          }),
        );
      });
    });

    describe("異常系", () => {
      test("存在しない token は VALIDATION でエラー", async () => {
        mockPendingFindUnique.mockResolvedValueOnce(null);

        await expect(
          consumeCustomerEmailChangeCommand(RAW_TOKEN),
        ).rejects.toMatchObject({
          code: "VALIDATION",
        });
        expect(mockCustomerUpdate).not.toHaveBeenCalled();
      });

      test("既に consumed な token は VALIDATION でエラー", async () => {
        mockPendingFindUnique.mockResolvedValueOnce({
          id: "pending-1",
          customerId: CUSTOMER_ID,
          newEmail: "verified@example.com",
          newEmailCanonical: "verified@example.com",
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: new Date(Date.now() - 1_000),
        });

        await expect(
          consumeCustomerEmailChangeCommand(RAW_TOKEN),
        ).rejects.toMatchObject({
          code: "VALIDATION",
        });
        expect(mockCustomerUpdate).not.toHaveBeenCalled();
      });

      test("期限切れ token は VALIDATION でエラー", async () => {
        mockPendingFindUnique.mockResolvedValueOnce({
          id: "pending-1",
          customerId: CUSTOMER_ID,
          newEmail: "verified@example.com",
          newEmailCanonical: "verified@example.com",
          expiresAt: new Date(Date.now() - 1_000),
          consumedAt: null,
        });

        await expect(
          consumeCustomerEmailChangeCommand(RAW_TOKEN),
        ).rejects.toMatchObject({
          code: "VALIDATION",
        });
        expect(mockCustomerUpdate).not.toHaveBeenCalled();
      });

      test("click までに他顧客がその email を確保していたら CONFLICT", async () => {
        mockPendingFindUnique.mockResolvedValueOnce({
          id: "pending-1",
          customerId: CUSTOMER_ID,
          newEmail: "raced@example.com",
          newEmailCanonical: "raced@example.com",
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        });
        mockCustomerFindFirst.mockResolvedValueOnce({ id: "other-guest" });

        await expect(
          consumeCustomerEmailChangeCommand(RAW_TOKEN),
        ).rejects.toMatchObject({
          code: "CONFLICT",
        });
        expect(mockPendingUpdate).not.toHaveBeenCalled();
        expect(mockCustomerUpdate).not.toHaveBeenCalled();
      });

      test("throw の場合でも Customer.email は書き換わらない (fail-closed)", async () => {
        mockPendingFindUnique.mockResolvedValueOnce({
          id: "pending-1",
          customerId: CUSTOMER_ID,
          newEmail: "fail@example.com",
          newEmailCanonical: "fail@example.com",
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: new Date(),
        });

        await expect(
          consumeCustomerEmailChangeCommand(RAW_TOKEN),
        ).rejects.toBeInstanceOf(DomainError);
        expect(mockCustomerUpdate).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // anonymizeCustomerCommand (STATE-03)
  // =============================================================================

  describe("anonymizeCustomerCommand", () => {
    describe("正常系", () => {
      test("存在する顧客を匿名化できる (PII 置換 + anonymizedAt 刻印)", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          userId: null,
          anonymizedAt: null,
        });

        const result = await anonymizeCustomerCommand({
          customerId: CUSTOMER_ID,
          reason: "customer-requested",
        });

        expect(result.customerId).toBe(CUSTOMER_ID);
        expect(result.reason).toBe("customer-requested");
        expect(result.hadUserId).toBe(false);
        expect(result.anonymizedAt).toBeInstanceOf(Date);

        // Customer.update に placeholder PII と anonymizedAt が渡る
        expect(mockCustomerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: CUSTOMER_ID },
            data: expect.objectContaining({
              email: `deleted+${CUSTOMER_ID}@anonymized.local`,
              emailCanonical: `deleted+${CUSTOMER_ID}@anonymized.local`,
              lastName: "削除済み",
              firstName: "",
              lastNameKana: null,
              firstNameKana: null,
              phoneNumber: null,
              companyName: null,
              postalCode: null,
              prefecture: null,
              city: null,
              streetAddress: null,
              building: null,
              notes: null,
              isActive: false,
              marketingOptIn: false,
              phoneContactOptIn: false,
              userId: null,
              anonymizedReason: "customer-requested",
            }),
          }),
        );
        // userId が null なら User.delete は呼ばれない
        expect(mockUserDelete).not.toHaveBeenCalled();
      });

      test("userId が非 null の顧客を匿名化すると Better Auth User も削除される", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          userId: USER_ID,
          anonymizedAt: null,
        });

        const result = await anonymizeCustomerCommand({
          customerId: CUSTOMER_ID,
          reason: "admin-purge",
        });

        expect(result.hadUserId).toBe(true);
        expect(mockUserDelete).toHaveBeenCalledWith({
          where: { id: USER_ID },
        });
      });

      test("data-retention 理由も受け付ける", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          userId: null,
          anonymizedAt: null,
        });

        const result = await anonymizeCustomerCommand({
          customerId: CUSTOMER_ID,
          reason: "data-retention",
        });

        expect(result.reason).toBe("data-retention");
        expect(mockCustomerUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              anonymizedReason: "data-retention",
            }),
          }),
        );
      });
    });

    describe("異常系", () => {
      test("存在しない顧客 ID は NOT_FOUND エラー", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce(null);

        await expect(
          anonymizeCustomerCommand({
            customerId: CUSTOMER_ID,
            reason: "customer-requested",
          }),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "顧客が見つかりません",
        });

        expect(mockCustomerUpdate).not.toHaveBeenCalled();
      });

      test("既に匿名化済みの顧客は CONFLICT エラー (冪等性チェック)", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          userId: null,
          anonymizedAt: new Date("2026-01-01T00:00:00Z"),
        });

        await expect(
          anonymizeCustomerCommand({
            customerId: CUSTOMER_ID,
            reason: "customer-requested",
          }),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: "この顧客は既に匿名化済みです",
        });

        expect(mockCustomerUpdate).not.toHaveBeenCalled();
        expect(mockUserDelete).not.toHaveBeenCalled();
      });

      test("throw の場合 DomainError インスタンスであること", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({
          id: CUSTOMER_ID,
          userId: null,
          anonymizedAt: new Date(),
        });

        await expect(
          anonymizeCustomerCommand({
            customerId: CUSTOMER_ID,
            reason: "admin-purge",
          }),
        ).rejects.toBeInstanceOf(DomainError);
      });
    });
  });
});
