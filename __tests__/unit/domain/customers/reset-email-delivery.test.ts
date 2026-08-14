import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

// EmailDeliveryStatus 定数（@generated/prisma/enums から Prisma enum を再現）
const EmailDeliveryStatus = {
  OK: "OK",
  SOFT_BOUNCED: "SOFT_BOUNCED",
  HARD_BOUNCED: "HARD_BOUNCED",
  COMPLAINED: "COMPLAINED",
} as const;
type EmailDeliveryStatus =
  (typeof EmailDeliveryStatus)[keyof typeof EmailDeliveryStatus];

// =============================================================================
// Mocks (must be defined before importing target module)
// =============================================================================

mock.module("server-only", () => ({}));

const mockCustomerFindUnique = mock<
  () => Promise<{
    id: string;
    emailDeliveryStatus: EmailDeliveryStatus;
    suppressedEmailHash: string | null;
  } | null>
>(() => Promise.resolve(null));

const mockCustomerUpdate = mock<
  (args: {
    where: { id: string };
    data: {
      emailDeliveryStatus: EmailDeliveryStatus;
      emailDeliveryUpdatedAt: Date;
      emailDeliveryReason: null;
      suppressedEmailHash: null;
    };
  }) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "customer-1" }));

// resetCustomerEmailDeliveryStatusCommand は $transaction を張らずに直呼びする。
// commands.ts の他 API との共存のため、$transaction / user / pending 系も
// mock.module に含めるが、reset 経路では使われない (呼び出しゼロを検証する)。
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      findUnique: mockCustomerFindUnique,
      update: mockCustomerUpdate,
      findFirst: mock(() => Promise.resolve(null)),
      findUniqueOrThrow: mock(() =>
        Promise.resolve({ id: "customer-1", email: null }),
      ),
      create: mock(() => Promise.resolve({ id: "customer-1" })),
      updateMany: mock(() => Promise.resolve({ count: 0 })),
    },
    pendingCustomerEmailChange: {
      create: mock(() => Promise.resolve({ id: "pending-1" })),
      deleteMany: mock(() => Promise.resolve({ count: 0 })),
      findUnique: mock(() => Promise.resolve(null)),
      update: mock(() => Promise.resolve({ id: "pending-1" })),
    },
    user: {
      findFirst: mock(() => Promise.resolve(null)),
      delete: mock(() => Promise.resolve({ id: "user-1" })),
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({}),
  },
}));

// `@generated/prisma/enums` は mock しない。prisma-types.ts が 40 近い enum 名を
// 直接 re-export しているため、部分 mock は「Export named 'X' not found」で fail する。
// 実 enums.ts は純粋な const オブジェクトの集合で副作用ゼロ・DB 接続なしのため
// テストで直接読んで安全。

// =============================================================================
// Import target after mocks
// =============================================================================

const { resetCustomerEmailDeliveryStatusCommand } =
  await import("@/shared/domain/customers/commands");

const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440000";

// =============================================================================
// Tests
// =============================================================================

describe("resetCustomerEmailDeliveryStatusCommand", () => {
  beforeEach(() => {
    mockCustomerFindUnique.mockReset();
    mockCustomerUpdate.mockReset();
    mockCustomerUpdate.mockResolvedValue({ id: CUSTOMER_ID });
  });

  describe("正常系", () => {
    test("HARD_BOUNCED をリセットすると previous に旧値が返り status/reason/updatedAt が書き換わる", async () => {
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: CUSTOMER_ID,
        emailDeliveryStatus: EmailDeliveryStatus.HARD_BOUNCED,
        suppressedEmailHash: null,
      });

      const result = await resetCustomerEmailDeliveryStatusCommand(CUSTOMER_ID);

      expect(result).toEqual({ previous: EmailDeliveryStatus.HARD_BOUNCED });

      expect(mockCustomerUpdate).toHaveBeenCalledTimes(1);
      const call = mockCustomerUpdate.mock.calls[0]?.[0];
      expect(call?.where).toEqual({ id: CUSTOMER_ID });
      expect(call?.data.emailDeliveryStatus).toBe(EmailDeliveryStatus.OK);
      expect(call?.data.emailDeliveryReason).toBeNull();
      expect(call?.data.emailDeliveryUpdatedAt).toBeInstanceOf(Date);
    });

    test("COMPLAINED をリセットしても同じ挙動 (previous に旧値)", async () => {
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: CUSTOMER_ID,
        emailDeliveryStatus: EmailDeliveryStatus.COMPLAINED,
        suppressedEmailHash: null,
      });

      const result = await resetCustomerEmailDeliveryStatusCommand(CUSTOMER_ID);

      expect(result).toEqual({ previous: EmailDeliveryStatus.COMPLAINED });
      expect(mockCustomerUpdate).toHaveBeenCalledTimes(1);
    });

    test("SOFT_BOUNCED をリセットしても同じ挙動 (previous に旧値)", async () => {
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: CUSTOMER_ID,
        emailDeliveryStatus: EmailDeliveryStatus.SOFT_BOUNCED,
        suppressedEmailHash: null,
      });

      const result = await resetCustomerEmailDeliveryStatusCommand(CUSTOMER_ID);

      expect(result).toEqual({ previous: EmailDeliveryStatus.SOFT_BOUNCED });
      expect(mockCustomerUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("冪等 no-op", () => {
    test("既に OK かつ hash 抑制も無ければ update を呼ばず previous: OK を返す", async () => {
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: CUSTOMER_ID,
        emailDeliveryStatus: EmailDeliveryStatus.OK,
        suppressedEmailHash: null,
      });

      const result = await resetCustomerEmailDeliveryStatusCommand(CUSTOMER_ID);

      expect(result).toEqual({ previous: EmailDeliveryStatus.OK });
      expect(mockCustomerUpdate).not.toHaveBeenCalled();
    });

    // 監査 F-44: 統合・匿名化で持ち越された hash は status に現れないため、
    // status だけで no-op を判定すると**復旧経路が 1 つも無くなる**。
    test("status が OK でも hash 抑制があればリセットする", async () => {
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: CUSTOMER_ID,
        emailDeliveryStatus: EmailDeliveryStatus.OK,
        suppressedEmailHash: "a".repeat(64),
      });

      const result = await resetCustomerEmailDeliveryStatusCommand(CUSTOMER_ID);

      expect(result).toEqual({ previous: EmailDeliveryStatus.OK });
      expect(mockCustomerUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("存在しない顧客 ID は NOT_FOUND エラー", async () => {
      mockCustomerFindUnique.mockResolvedValueOnce(null);

      await expect(
        resetCustomerEmailDeliveryStatusCommand(CUSTOMER_ID),
      ).rejects.toBeInstanceOf(DomainError);

      // 別 rejects 呼び出しでコード検証
      mockCustomerFindUnique.mockResolvedValueOnce(null);
      await expect(
        resetCustomerEmailDeliveryStatusCommand(CUSTOMER_ID),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "顧客が見つかりません",
      });

      expect(mockCustomerUpdate).not.toHaveBeenCalled();
    });
  });
});
