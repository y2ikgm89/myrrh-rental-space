import { describe, test, expect, mock, beforeEach } from "bun:test";

// InquiryStatus 定数（FLAGGED / SPAM 追加後の 6 値）
const InquiryStatus = {
  NEW: "NEW",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
  FLAGGED: "FLAGGED",
  SPAM: "SPAM",
} as const;
type InquiryStatus = (typeof InquiryStatus)[keyof typeof InquiryStatus];

// InquiryReplyAuthorType 定数（新設 enum）
const InquiryReplyAuthorType = {
  STAFF: "STAFF",
  CUSTOMER: "CUSTOMER",
} as const;

const CustomerType = {
  PERSONAL: "PERSONAL",
  CORPORATE: "CORPORATE",
} as const;

// P2002 receiptNumber collision retry test 用の Prisma error stub
class PrismaClientKnownRequestError extends Error {
  code: string;
  meta?: Record<string, unknown>;
  constructor(
    message: string,
    opts: { code: string; meta?: Record<string, unknown> },
  ) {
    super(message);
    this.code = opts.code;
    if (opts.meta !== undefined) {
      this.meta = opts.meta;
    }
    this.name = "PrismaClientKnownRequestError";
  }
}

// -----------------------------------------------------------------------------
// Prisma モック関数（mock.module より先に定義）
// -----------------------------------------------------------------------------

const mockInquiryFindUnique = mock<
  (args: unknown) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockInquiryCreate = mock<
  (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "inquiry-1", receiptNumber: "INQ-DEADBEEF" }));

const mockInquiryUpdate = mock<
  (args: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "inquiry-1" }));

const mockInquiryReplyCreate = mock<
  (args: { data: Record<string, unknown> }) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "reply-1" }));

const mockStatusHistoryCreate = mock<
  (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "history-1" }));

const mockCustomerFindUnique = mock<
  (args: Record<string, unknown>) => Promise<{ id: string } | null>
>(() => Promise.resolve(null));

const mockCustomerFindFirst = mock<
  (args: Record<string, unknown>) => Promise<{ id: string } | null>
>(() => Promise.resolve(null));

const mockCustomerCreate = mock<
  (args: Record<string, unknown>) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "guest-customer-id" }));

const mockIsFeatureEnabled = mock<(module: string) => Promise<boolean>>(() =>
  Promise.resolve(true),
);

// $transaction が受け取る callback へ渡す tx client。
// 全ての inquiry 系書込は tx.inquiry / tx.inquiryReply / tx.inquiryStatusHistory
// に対して実行されるため、外部 mock を tx 経由でも共有する。
const prismaInquiry = {
  findUnique: mockInquiryFindUnique,
  create: mockInquiryCreate,
  update: mockInquiryUpdate,
};
const prismaInquiryReply = { create: mockInquiryReplyCreate };
const prismaInquiryStatusHistory = { create: mockStatusHistoryCreate };
const prismaCustomer = {
  findUnique: mockCustomerFindUnique,
  findFirst: mockCustomerFindFirst,
  create: mockCustomerCreate,
};

// -----------------------------------------------------------------------------
// モジュールモック（import より前に配置）
// -----------------------------------------------------------------------------

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    inquiry: prismaInquiry,
    inquiryReply: prismaInquiryReply,
    inquiryStatusHistory: prismaInquiryStatusHistory,
    customer: prismaCustomer,
    $transaction: <T>(
      fn: (tx: {
        inquiry: typeof prismaInquiry;
        inquiryReply: typeof prismaInquiryReply;
        inquiryStatusHistory: typeof prismaInquiryStatusHistory;
        customer: typeof prismaCustomer;
      }) => Promise<T>,
    ) =>
      fn({
        inquiry: prismaInquiry,
        inquiryReply: prismaInquiryReply,
        inquiryStatusHistory: prismaInquiryStatusHistory,
        customer: prismaCustomer,
      }),
  },
}));

mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: mockIsFeatureEnabled,
}));

// helpers.ts が transitive import する他 enum (Role, ReservationStatus, AuditAction, ...) を
// 潰さないよう spread + override 形式で mock する。
const actualEnums = await import("@generated/prisma/enums");
mock.module("@generated/prisma/enums", () => ({
  ...actualEnums,
  InquiryStatus,
  InquiryReplyAuthorType,
  CustomerType,
}));

mock.module("@generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError,
  },
}));

// -----------------------------------------------------------------------------
// Target import
// -----------------------------------------------------------------------------

const { DomainError } = await import("@/shared/domain/domain-error");
const {
  updateInquiryStatus,
  replyToInquiryCommand,
  deleteInquiry,
  createInquiryCommand,
  updateInquiryCustomer,
} = await import("@/shared/domain/inquiries/commands");

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const INQUIRY_ID = "550e8400-e29b-41d4-a716-446655440001";
const USER_ID = "660e8400-e29b-41d4-a716-446655440001";
const CUSTOMER_ID = "770e8400-e29b-41d4-a716-446655440001";

const EXISTING_INQUIRY = {
  id: INQUIRY_ID,
  name: "山田太郎",
  email: "yamada@example.com",
  subject: "スペース利用について",
  message: "詳しい料金を教えてください。",
  status: InquiryStatus.NEW,
  receiptNumber: "INQ-ABCDEF12",
  deletedAt: null,
  customer: null,
};

const VALID_CREATE_INPUT: {
  name: string;
  companyName: string | null;
  email: string;
  subject: string;
  message: string;
} = {
  name: "田中花子",
  companyName: "株式会社テスト",
  email: "tanaka@example.com",
  subject: "予約について",
  message: "利用可能な日時を教えてください。",
};

describe("inquiries/commands", () => {
  beforeEach(() => {
    mockInquiryFindUnique.mockReset();
    mockInquiryCreate.mockReset();
    mockInquiryUpdate.mockReset();
    mockInquiryReplyCreate.mockReset();
    mockStatusHistoryCreate.mockReset();
    mockCustomerFindUnique.mockReset();
    mockCustomerFindFirst.mockReset();
    mockCustomerCreate.mockReset();
    mockIsFeatureEnabled.mockReset();

    // デフォルト
    mockInquiryFindUnique.mockResolvedValue(null);
    mockInquiryCreate.mockResolvedValue({
      id: INQUIRY_ID,
      receiptNumber: "INQ-ABCDEF12",
    });
    mockInquiryUpdate.mockResolvedValue({ id: INQUIRY_ID });
    mockInquiryReplyCreate.mockResolvedValue({ id: "reply-1" });
    mockStatusHistoryCreate.mockResolvedValue({ id: "history-1" });
    mockCustomerFindUnique.mockResolvedValue(null);
    mockCustomerFindFirst.mockResolvedValue(null);
    mockCustomerCreate.mockResolvedValue({ id: "guest-customer-id" });
    mockIsFeatureEnabled.mockResolvedValue(true);
  });

  // =============================================================================
  // updateInquiryStatus
  // =============================================================================

  describe("updateInquiryStatus", () => {
    describe("正常系", () => {
      test("NEW → IN_PROGRESS へ遷移し、Inquiry.update と InquiryStatusHistory.create が呼ばれる", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.NEW,
          deletedAt: null,
        });

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.IN_PROGRESS, USER_ID),
        ).resolves.toBeUndefined();

        expect(mockInquiryUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: INQUIRY_ID },
            data: { status: InquiryStatus.IN_PROGRESS },
          }),
        );
        expect(mockStatusHistoryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              inquiryId: INQUIRY_ID,
              fromStatus: InquiryStatus.NEW,
              toStatus: InquiryStatus.IN_PROGRESS,
              changedById: USER_ID,
            }),
          }),
        );
      });

      test("changedById に null を指定できる (システム経路)", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.NEW,
          deletedAt: null,
        });

        await updateInquiryStatus(
          INQUIRY_ID,
          InquiryStatus.CLOSED,
          null,
          "auto-close",
        );

        expect(mockStatusHistoryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              changedById: null,
              reason: "auto-close",
            }),
          }),
        );
      });

      test("同一ステータスへの遷移は no-op でスキップされ update が呼ばれない", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.NEW,
          deletedAt: null,
        });

        await updateInquiryStatus(INQUIRY_ID, InquiryStatus.NEW, USER_ID);

        expect(mockInquiryUpdate).not.toHaveBeenCalled();
        expect(mockStatusHistoryCreate).not.toHaveBeenCalled();
      });
    });

    describe("新遷移: FLAGGED / SPAM", () => {
      test("NEW → FLAGGED が許可される", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.NEW,
          deletedAt: null,
        });

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.FLAGGED, USER_ID),
        ).resolves.toBeUndefined();
      });

      test("NEW → SPAM が許可される", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.NEW,
          deletedAt: null,
        });

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.SPAM, USER_ID),
        ).resolves.toBeUndefined();
      });

      test("FLAGGED → NEW への逆方向遷移が許可される (reversible)", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.FLAGGED,
          deletedAt: null,
        });

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.NEW, USER_ID),
        ).resolves.toBeUndefined();
      });

      test("FLAGGED → IN_PROGRESS が許可される", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.FLAGGED,
          deletedAt: null,
        });

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.IN_PROGRESS, USER_ID),
        ).resolves.toBeUndefined();
      });

      test("FLAGGED → SPAM が許可される", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.FLAGGED,
          deletedAt: null,
        });

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.SPAM, USER_ID),
        ).resolves.toBeUndefined();
      });

      test("SPAM → CLOSED が許可される (誤判定訂正)", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.SPAM,
          deletedAt: null,
        });

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.CLOSED, USER_ID),
        ).resolves.toBeUndefined();
      });

      test("SPAM → NEW は禁止 (VALIDATION エラー)", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.SPAM,
          deletedAt: null,
        });

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.NEW, USER_ID),
        ).rejects.toMatchObject({ code: "VALIDATION" });

        expect(mockInquiryUpdate).not.toHaveBeenCalled();
      });
    });

    describe("状態遷移バリデーション", () => {
      test("CLOSED からは任意遷移が拒否される (terminal)", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.CLOSED,
          deletedAt: null,
        });

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.RESOLVED, USER_ID),
        ).rejects.toMatchObject({ code: "VALIDATION" });
      });

      test("RESOLVED → IN_PROGRESS は backward で拒否される", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.RESOLVED,
          deletedAt: null,
        });

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.IN_PROGRESS, USER_ID),
        ).rejects.toMatchObject({ code: "VALIDATION" });
      });

      test("RESOLVED → FLAGGED は許可される (要注意フラグ後付け)", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.RESOLVED,
          deletedAt: null,
        });

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.FLAGGED, USER_ID),
        ).resolves.toBeUndefined();
      });
    });

    describe("異常系", () => {
      test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(null);

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.RESOLVED, USER_ID),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "お問い合わせが見つかりません",
        });
      });

      test("soft-deleted な Inquiry は NOT_FOUND として扱う", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          status: InquiryStatus.NEW,
          deletedAt: new Date("2099-01-01T00:00:00Z"),
        });

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.RESOLVED, USER_ID),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });

        expect(mockInquiryUpdate).not.toHaveBeenCalled();
      });

      test("NOT_FOUND エラー時に update が呼ばれない", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(null);

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.RESOLVED, USER_ID),
        ).rejects.toThrow(DomainError);

        expect(mockInquiryUpdate).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // replyToInquiryCommand
  // =============================================================================

  describe("replyToInquiryCommand", () => {
    describe("正常系", () => {
      test("NEW からの返信で InquiryReply.create + Inquiry.update + StatusHistory.create が呼ばれる", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(EXISTING_INQUIRY);

        const result = await replyToInquiryCommand(
          INQUIRY_ID,
          "詳細についてご案内します。",
          USER_ID,
        );

        expect(result.id).toBe(INQUIRY_ID);
        expect(result.replyId).toBe("reply-1");
        expect(result.emailContext).toEqual({
          name: "山田太郎",
          email: "yamada@example.com",
          subject: "スペース利用について",
          message: "詳しい料金を教えてください。",
          receiptNumber: "INQ-ABCDEF12",
          customerUserId: null,
        });

        expect(mockInquiryReplyCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              inquiryId: INQUIRY_ID,
              authorType: InquiryReplyAuthorType.STAFF,
              authorId: USER_ID,
              body: "詳細についてご案内します。",
            }),
          }),
        );

        // NEW → IN_PROGRESS への advance
        expect(mockInquiryUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: INQUIRY_ID },
            data: { status: InquiryStatus.IN_PROGRESS },
          }),
        );
        expect(mockStatusHistoryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              inquiryId: INQUIRY_ID,
              fromStatus: InquiryStatus.NEW,
              toStatus: InquiryStatus.IN_PROGRESS,
              changedById: USER_ID,
            }),
          }),
        );
      });

      test("customer.userId が設定されている場合 emailContext.customerUserId に反映される", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          ...EXISTING_INQUIRY,
          customer: { userId: "user-linked-001" },
        });

        const result = await replyToInquiryCommand(
          INQUIRY_ID,
          "詳細についてご案内します。",
          USER_ID,
        );

        expect(result.emailContext.customerUserId).toBe("user-linked-001");
      });

      test("IN_PROGRESS からの返信は status を advance しない", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          ...EXISTING_INQUIRY,
          status: InquiryStatus.IN_PROGRESS,
        });

        await replyToInquiryCommand(INQUIRY_ID, "返信内容", USER_ID);

        expect(mockInquiryReplyCreate).toHaveBeenCalledTimes(1);
        expect(mockInquiryUpdate).not.toHaveBeenCalled();
        expect(mockStatusHistoryCreate).not.toHaveBeenCalled();
      });

      test("RESOLVED からの返信は status を advance しない (現状維持)", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          ...EXISTING_INQUIRY,
          status: InquiryStatus.RESOLVED,
        });

        await replyToInquiryCommand(INQUIRY_ID, "返信内容", USER_ID);

        expect(mockInquiryReplyCreate).toHaveBeenCalledTimes(1);
        expect(mockInquiryUpdate).not.toHaveBeenCalled();
      });

      test("CLOSED からの返信は status を advance しない (現状維持)", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          ...EXISTING_INQUIRY,
          status: InquiryStatus.CLOSED,
        });

        await replyToInquiryCommand(INQUIRY_ID, "返信内容", USER_ID);

        expect(mockInquiryReplyCreate).toHaveBeenCalledTimes(1);
        expect(mockInquiryUpdate).not.toHaveBeenCalled();
      });

      test("SPAM からの返信は status を advance しない (現状維持)", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          ...EXISTING_INQUIRY,
          status: InquiryStatus.SPAM,
        });

        await replyToInquiryCommand(INQUIRY_ID, "返信内容", USER_ID);

        expect(mockInquiryReplyCreate).toHaveBeenCalledTimes(1);
        expect(mockInquiryUpdate).not.toHaveBeenCalled();
      });

      test("emailContext に receiptNumber が含まれる", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(EXISTING_INQUIRY);

        const result = await replyToInquiryCommand(
          INQUIRY_ID,
          "返信内容",
          USER_ID,
        );

        expect(result.emailContext.receiptNumber).toBe("INQ-ABCDEF12");
      });
    });

    describe("異常系", () => {
      test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(null);

        await expect(
          replyToInquiryCommand(INQUIRY_ID, "返信", USER_ID),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "お問い合わせが見つかりません",
        });
      });

      test("soft-deleted な Inquiry は NOT_FOUND として扱う", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          ...EXISTING_INQUIRY,
          deletedAt: new Date("2099-01-01T00:00:00Z"),
        });

        await expect(
          replyToInquiryCommand(INQUIRY_ID, "返信", USER_ID),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });

        expect(mockInquiryReplyCreate).not.toHaveBeenCalled();
        expect(mockInquiryUpdate).not.toHaveBeenCalled();
      });

      test("NOT_FOUND エラー時に InquiryReply.create が呼ばれない", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(null);

        await expect(
          replyToInquiryCommand(INQUIRY_ID, "返信", USER_ID),
        ).rejects.toThrow(DomainError);

        expect(mockInquiryReplyCreate).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // deleteInquiry (soft delete)
  // =============================================================================

  describe("deleteInquiry", () => {
    describe("正常系", () => {
      test("存在するお問い合わせを soft delete する (update で deletedAt を書く)", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          deletedAt: null,
        });

        await expect(deleteInquiry(INQUIRY_ID)).resolves.toBeUndefined();

        expect(mockInquiryUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: INQUIRY_ID },
            data: expect.objectContaining({
              deletedAt: expect.any(Date),
            }),
          }),
        );
      });

      test("update が正しい ID で呼ばれる", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          deletedAt: null,
        });

        await deleteInquiry(INQUIRY_ID);

        expect(mockInquiryUpdate).toHaveBeenCalledTimes(1);
      });

      test("既に soft-deleted の Inquiry は no-op で update が呼ばれない", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({
          id: INQUIRY_ID,
          deletedAt: new Date("2099-01-01T00:00:00Z"),
        });

        await expect(deleteInquiry(INQUIRY_ID)).resolves.toBeUndefined();

        expect(mockInquiryUpdate).not.toHaveBeenCalled();
      });
    });

    describe("異常系", () => {
      test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(null);

        await expect(deleteInquiry(INQUIRY_ID)).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "お問い合わせが見つかりません",
        });
      });

      test("NOT_FOUND エラー時に update が呼ばれない", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(null);

        await expect(deleteInquiry(INQUIRY_ID)).rejects.toThrow(DomainError);

        expect(mockInquiryUpdate).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // updateInquiryCustomer
  // =============================================================================

  describe("updateInquiryCustomer", () => {
    test("customer 紐付けを変更し {before, after} を返す", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce({
        id: INQUIRY_ID,
        customerId: null,
        deletedAt: null,
      });
      mockCustomerFindUnique.mockResolvedValueOnce({ id: CUSTOMER_ID });

      const result = await updateInquiryCustomer(INQUIRY_ID, CUSTOMER_ID);

      expect(result).toEqual({ before: null, after: CUSTOMER_ID });
      expect(mockInquiryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INQUIRY_ID },
          data: { customerId: CUSTOMER_ID },
        }),
      );
    });

    test("customerId が同一なら update が呼ばれない (no-op)", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce({
        id: INQUIRY_ID,
        customerId: CUSTOMER_ID,
        deletedAt: null,
      });
      mockCustomerFindUnique.mockResolvedValueOnce({ id: CUSTOMER_ID });

      const result = await updateInquiryCustomer(INQUIRY_ID, CUSTOMER_ID);

      expect(result).toEqual({ before: CUSTOMER_ID, after: CUSTOMER_ID });
      expect(mockInquiryUpdate).not.toHaveBeenCalled();
    });

    test("soft-deleted な Inquiry は NOT_FOUND として扱う", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce({
        id: INQUIRY_ID,
        customerId: null,
        deletedAt: new Date("2099-01-01T00:00:00Z"),
      });

      await expect(
        updateInquiryCustomer(INQUIRY_ID, CUSTOMER_ID),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // =============================================================================
  // createInquiryCommand
  // =============================================================================

  describe("createInquiryCommand", () => {
    describe("正常系", () => {
      test("customerId が明示されている場合はそのまま使用する（3段解決: 第1段）", async () => {
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
        });

        const result = await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          customerId: CUSTOMER_ID,
        });

        expect(result.id).toBe(INQUIRY_ID);
        expect(result.receiptNumber).toMatch(/^INQ-[0-9A-F]{8}$/);
        expect(mockCustomerFindUnique).not.toHaveBeenCalled();
        expect(mockInquiryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              customerId: CUSTOMER_ID,
            }),
          }),
        );
      });

      test("Inquiry.create と InquiryStatusHistory.create が同一 transaction で呼ばれる", async () => {
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
        });

        await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          customerId: CUSTOMER_ID,
        });

        expect(mockInquiryCreate).toHaveBeenCalledTimes(1);
        expect(mockStatusHistoryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              inquiryId: INQUIRY_ID,
              fromStatus: null,
              toStatus: InquiryStatus.NEW,
              changedById: null,
            }),
          }),
        );
      });

      test("customerId が未指定でメール一致の会員顧客が存在しても未リンクゲスト顧客を作成する", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({ id: CUSTOMER_ID });
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
        });

        const result = await createInquiryCommand(VALID_CREATE_INPUT);

        expect(result.id).toBe(INQUIRY_ID);
        expect(mockCustomerFindUnique).not.toHaveBeenCalled();
        expect(mockCustomerFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              emailCanonical: "tanaka@example.com",
              userId: null,
            }),
          }),
        );
        expect(mockCustomerCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              email: VALID_CREATE_INPUT.email,
              emailCanonical: "tanaka@example.com",
              userId: null,
            }),
          }),
        );
        expect(mockInquiryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              customerId: "guest-customer-id",
            }),
          }),
        );
      });

      test("customerId が未指定で同じメールの未リンクゲスト顧客が存在する場合はその ID を使用する", async () => {
        mockCustomerFindFirst.mockResolvedValueOnce({
          id: "guest-existing-id",
        });
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
        });

        const result = await createInquiryCommand(VALID_CREATE_INPUT);

        expect(result.id).toBe(INQUIRY_ID);
        expect(mockCustomerCreate).not.toHaveBeenCalled();
        expect(mockInquiryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              customerId: "guest-existing-id",
            }),
          }),
        );
      });

      test("customerId: null が明示されている場合も未リンクゲスト顧客を作成する", async () => {
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
        });

        await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          customerId: null,
        });

        expect(mockCustomerFindUnique).not.toHaveBeenCalled();
        expect(mockCustomerFindFirst).toHaveBeenCalledTimes(1);
        expect(mockCustomerCreate).toHaveBeenCalledTimes(1);
      });

      test("ステータスが NEW で作成される", async () => {
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
        });

        await createInquiryCommand(VALID_CREATE_INPUT);

        expect(mockInquiryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: InquiryStatus.NEW,
            }),
          }),
        );
      });

      test("receiptNumber (INQ-XXXXXXXX 形式) が採番され Inquiry.create に渡される", async () => {
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-DEADBEEF",
        });

        await createInquiryCommand(VALID_CREATE_INPUT);

        const call = mockInquiryCreate.mock.calls.at(0)?.[0] as
          { data: { receiptNumber: string } } | undefined;
        expect(call?.data.receiptNumber).toMatch(/^INQ-[0-9A-F]{8}$/);
      });

      test("payload に receiptNumber / phoneNumber を含む全入力フィールドが含まれる", async () => {
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
        });

        const result = await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          phoneNumber: "090-1234-5678",
        });

        expect(result.payload).toEqual({
          inquiryId: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
          name: "田中花子",
          companyName: "株式会社テスト",
          email: "tanaka@example.com",
          phoneNumber: "090-1234-5678",
          subject: "予約について",
          message: "利用可能な日時を教えてください。",
        });
      });

      test("phoneNumber が省略された場合は null として payload に入る", async () => {
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
        });

        const result = await createInquiryCommand(VALID_CREATE_INPUT);

        expect(result.payload.phoneNumber).toBeNull();
      });

      test("companyName が空文字の場合は null として保存される", async () => {
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
        });

        await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          companyName: "",
        });

        expect(mockInquiryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              companyName: null,
            }),
          }),
        );
      });

      test("companyName が null の場合も null として保存される", async () => {
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
        });

        await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          companyName: null,
        });

        expect(mockInquiryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              companyName: null,
            }),
          }),
        );
      });

      test("payload の companyName は入力値をそのまま保持する (null pass-through)", async () => {
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
        });

        const result = await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          companyName: null,
        });

        expect(result.payload.companyName).toBeNull();
      });
    });

    describe("receiptNumber collision retry", () => {
      test("P2002 (receiptNumber target) で最大 5 回まで retry する", async () => {
        // 4 回 collision → 5 回目で成功
        const collision = new PrismaClientKnownRequestError(
          "unique constraint failed",
          { code: "P2002", meta: { target: ["receiptNumber"] } },
        );
        mockInquiryCreate
          .mockRejectedValueOnce(collision)
          .mockRejectedValueOnce(collision)
          .mockRejectedValueOnce(collision)
          .mockRejectedValueOnce(collision)
          .mockResolvedValueOnce({
            id: INQUIRY_ID,
            receiptNumber: "INQ-SUCCESS1",
          });

        const result = await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          customerId: CUSTOMER_ID,
        });

        expect(result.id).toBe(INQUIRY_ID);
        expect(mockInquiryCreate).toHaveBeenCalledTimes(5);
      });

      test("5 回連続 collision で UNEXPECTED エラーをスローする", async () => {
        const collision = new PrismaClientKnownRequestError(
          "unique constraint failed",
          { code: "P2002", meta: { target: ["receiptNumber"] } },
        );
        mockInquiryCreate
          .mockRejectedValueOnce(collision)
          .mockRejectedValueOnce(collision)
          .mockRejectedValueOnce(collision)
          .mockRejectedValueOnce(collision)
          .mockRejectedValueOnce(collision);

        await expect(
          createInquiryCommand({
            ...VALID_CREATE_INPUT,
            customerId: CUSTOMER_ID,
          }),
        ).rejects.toMatchObject({ code: "UNEXPECTED" });

        expect(mockInquiryCreate).toHaveBeenCalledTimes(5);
      });

      test("P2002 でも target が receiptNumber でない場合は retry せず throw", async () => {
        const otherUniqueError = new PrismaClientKnownRequestError(
          "unique constraint failed",
          { code: "P2002", meta: { target: ["email"] } },
        );
        mockInquiryCreate.mockRejectedValueOnce(otherUniqueError);

        await expect(
          createInquiryCommand({
            ...VALID_CREATE_INPUT,
            customerId: CUSTOMER_ID,
          }),
        ).rejects.toBe(otherUniqueError);

        expect(mockInquiryCreate).toHaveBeenCalledTimes(1);
      });
    });

    describe("異常系", () => {
      test("contact feature module が OFF の場合は VALIDATION エラーで拒否し、作成処理を行わない", async () => {
        mockIsFeatureEnabled.mockResolvedValueOnce(false);

        await expect(
          createInquiryCommand(VALID_CREATE_INPUT),
        ).rejects.toMatchObject({ code: "VALIDATION" });
        expect(mockCustomerFindFirst).not.toHaveBeenCalled();
        expect(mockInquiryCreate).not.toHaveBeenCalled();
      });
    });

    describe("エッジケース", () => {
      test("customerId: undefined は未指定として扱い未リンクゲスト顧客 lookup が実行される", async () => {
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
        });

        await createInquiryCommand({
          ...VALID_CREATE_INPUT,
        });

        expect(mockCustomerFindUnique).not.toHaveBeenCalled();
        expect(mockCustomerFindFirst).toHaveBeenCalledTimes(1);
      });

      test("create が返す id が結果の id に反映される", async () => {
        const generatedId = "generated-uuid-12345";
        mockInquiryCreate.mockResolvedValueOnce({
          id: generatedId,
          receiptNumber: "INQ-GENERATE",
        });

        const result = await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          customerId: CUSTOMER_ID,
        });

        expect(result.id).toBe(generatedId);
        expect(result.payload.inquiryId).toBe(generatedId);
      });

      test("未リンクゲスト顧客 lookup には select で id フィールドが指定される", async () => {
        mockInquiryCreate.mockResolvedValueOnce({
          id: INQUIRY_ID,
          receiptNumber: "INQ-ABCDEF12",
        });

        await createInquiryCommand(VALID_CREATE_INPUT);

        expect(mockCustomerFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            select: { id: true },
          }),
        );
      });
    });
  });
});
