import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createHash } from "node:crypto";

const TARGET_ID = "550e8400-e29b-41d4-a716-446655440000";
const SOURCE_ID = "660e8400-e29b-41d4-a716-446655440001";
const USER_ID = "770e8400-e29b-41d4-a716-446655440002";
const PENDING_ID = "880e8400-e29b-41d4-a716-446655440003";
const EMAIL = "guest@example.com";

const mockCustomerFindUnique = mock<
  (args: { where: { id: string } }) => Promise<{
    id: string;
    userId: string | null;
    email: string | null;
    emailCanonical: string;
    anonymizedAt: Date | null;
  } | null>
>(() => Promise.resolve(null));

const mockCustomerFindFirst = mock<
  () => Promise<{
    id: string;
    email: string | null;
    emailCanonical: string;
  } | null>
>(() => Promise.resolve(null));

const mockReservationCount = mock(() => Promise.resolve(0));
const mockInquiryCount = mock(() => Promise.resolve(0));
const mockReviewCount = mock(() => Promise.resolve(0));
const mockRegistrationCount = mock(() => Promise.resolve(0));

const mockPendingFindUnique = mock<
  (args?: {
    where?: { tokenHash?: string; id?: string };
    select?: unknown;
  }) => Promise<{
    id: string;
    targetCustomerId: string;
    sourceCustomerId: string;
    guestEmail: string;
    expiresAt: Date;
    consumedAt: Date | null;
  } | null>
>(() => Promise.resolve(null));

const mockPendingCreate = mock(() => Promise.resolve({ id: PENDING_ID }));
const mockPendingDeleteMany = mock(() => Promise.resolve({ count: 0 }));
const mockPendingUpdate = mock(() => Promise.resolve({ id: PENDING_ID }));

const mockMergeCustomerCommand = mock(() =>
  Promise.resolve({
    transferredReservations: 2,
    transferredSeries: 0,
    transferredInquiries: 1,
    transferredReviews: 0,
    transferredRegistrations: 1,
    preservedSuppression: false,
  }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/domain/customers/customer-lifecycle-commands", () => ({
  mergeCustomerCommand: mockMergeCustomerCommand,
}));

const prismaPending = {
  findUnique: mockPendingFindUnique,
  create: mockPendingCreate,
  deleteMany: mockPendingDeleteMany,
  update: mockPendingUpdate,
};

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      findUnique: mockCustomerFindUnique,
      findFirst: mockCustomerFindFirst,
    },
    reservation: { count: mockReservationCount },
    inquiry: { count: mockInquiryCount },
    spaceReview: { count: mockReviewCount },
    eventRegistration: { count: mockRegistrationCount },
    pendingCustomerMerge: prismaPending,
    $transaction: <T>(
      fn: (tx: { pendingCustomerMerge: typeof prismaPending }) => Promise<T>,
    ) => fn({ pendingCustomerMerge: prismaPending }),
  },
}));

const {
  requestCustomerMergeCommand,
  validateCustomerMergeTokenCommand,
  consumeCustomerMergeTokenCommand,
  CUSTOMER_MERGE_TOKEN_TTL_MS,
} = await import("@/shared/domain/customers/customer-merge-commands");

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function mockTargetAndSource(options?: {
  sourceLinked?: boolean;
  sourceAnonymized?: boolean;
  sameEmail?: boolean;
}) {
  mockCustomerFindUnique.mockImplementation(({ where }) => {
    if (where.id === TARGET_ID) {
      return Promise.resolve({
        id: TARGET_ID,
        userId: USER_ID,
        email: EMAIL,
        emailCanonical: EMAIL,
        anonymizedAt: null,
      });
    }
    if (where.id === SOURCE_ID) {
      return Promise.resolve({
        id: SOURCE_ID,
        userId: options?.sourceLinked ? USER_ID : null,
        email: EMAIL,
        emailCanonical:
          options?.sameEmail === false ? "other@example.com" : EMAIL,
        anonymizedAt: options?.sourceAnonymized ? new Date() : null,
      });
    }
    return Promise.resolve(null);
  });
}

describe("customer-merge-commands", () => {
  beforeEach(() => {
    mockCustomerFindUnique.mockReset();
    mockCustomerFindFirst.mockReset();
    mockReservationCount.mockReset();
    mockInquiryCount.mockReset();
    mockReviewCount.mockReset();
    mockRegistrationCount.mockReset();
    mockPendingFindUnique.mockReset();
    mockPendingCreate.mockReset();
    mockPendingDeleteMany.mockReset();
    mockPendingUpdate.mockReset();
    mockMergeCustomerCommand.mockReset();

    mockReservationCount.mockResolvedValue(1);
    mockInquiryCount.mockResolvedValue(0);
    mockReviewCount.mockResolvedValue(0);
    mockRegistrationCount.mockResolvedValue(0);
    mockMergeCustomerCommand.mockResolvedValue({
      transferredReservations: 2,
      transferredSeries: 0,
      transferredInquiries: 1,
      transferredReviews: 0,
      transferredRegistrations: 1,
      preservedSuppression: false,
    });
  });

  describe("requestCustomerMergeCommand", () => {
    test("正常系: rawToken と guestEmail を返す", async () => {
      mockTargetAndSource();
      const result = await requestCustomerMergeCommand(TARGET_ID, SOURCE_ID);
      expect(result.rawToken.length).toBeGreaterThan(20);
      expect(result.guestEmail).toBe(EMAIL);
      expect(mockPendingDeleteMany).toHaveBeenCalled();
      expect(mockPendingCreate).toHaveBeenCalled();
    });

    test("同一 customer は VALIDATION", async () => {
      await expect(
        requestCustomerMergeCommand(TARGET_ID, TARGET_ID),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    test("linked source は VALIDATION", async () => {
      mockTargetAndSource({ sourceLinked: true });
      await expect(
        requestCustomerMergeCommand(TARGET_ID, SOURCE_ID),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    test("anonymized source は VALIDATION", async () => {
      mockTargetAndSource({ sourceAnonymized: true });
      await expect(
        requestCustomerMergeCommand(TARGET_ID, SOURCE_ID),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });
  });

  describe("validateCustomerMergeTokenCommand", () => {
    test("有効 token で preview を返す", async () => {
      const rawToken = "valid-token-abc";
      mockPendingFindUnique.mockResolvedValueOnce({
        id: PENDING_ID,
        targetCustomerId: TARGET_ID,
        sourceCustomerId: SOURCE_ID,
        guestEmail: EMAIL,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      });
      mockReservationCount.mockResolvedValueOnce(3);

      const preview = await validateCustomerMergeTokenCommand(rawToken);
      expect(preview.guestEmail).toBe(EMAIL);
      expect(preview.reservationCount).toBe(3);
      expect(mockPendingFindUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashToken(rawToken) },
        select: expect.any(Object),
      });
    });

    test("無効 token は VALIDATION", async () => {
      mockPendingFindUnique.mockResolvedValueOnce(null);
      await expect(
        validateCustomerMergeTokenCommand("missing"),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    test("期限切れ token は VALIDATION", async () => {
      mockPendingFindUnique.mockResolvedValueOnce({
        id: PENDING_ID,
        targetCustomerId: TARGET_ID,
        sourceCustomerId: SOURCE_ID,
        guestEmail: EMAIL,
        expiresAt: new Date(Date.now() - 1),
        consumedAt: null,
      });
      await expect(
        validateCustomerMergeTokenCommand("expired"),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    test("既消費 token は VALIDATION", async () => {
      mockPendingFindUnique.mockResolvedValueOnce({
        id: PENDING_ID,
        targetCustomerId: TARGET_ID,
        sourceCustomerId: SOURCE_ID,
        guestEmail: EMAIL,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: new Date(),
      });
      await expect(
        validateCustomerMergeTokenCommand("used"),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });
  });

  describe("consumeCustomerMergeTokenCommand", () => {
    test("正常系: mergeCustomerCommand を呼ぶ", async () => {
      const rawToken = "consume-token";
      mockPendingFindUnique
        .mockResolvedValueOnce({
          id: PENDING_ID,
          targetCustomerId: TARGET_ID,
          sourceCustomerId: SOURCE_ID,
          guestEmail: EMAIL,
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        })
        .mockResolvedValueOnce({
          id: PENDING_ID,
          targetCustomerId: TARGET_ID,
          sourceCustomerId: SOURCE_ID,
          guestEmail: EMAIL,
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        });

      mockCustomerFindUnique.mockResolvedValueOnce({
        id: SOURCE_ID,
        userId: null,
        email: EMAIL,
        emailCanonical: EMAIL,
        anonymizedAt: null,
      });

      const result = await consumeCustomerMergeTokenCommand(
        rawToken,
        TARGET_ID,
      );
      expect(result.targetCustomerId).toBe(TARGET_ID);
      expect(mockMergeCustomerCommand).toHaveBeenCalledWith(
        SOURCE_ID,
        TARGET_ID,
        expect.anything(),
      );
      expect(mockPendingUpdate).toHaveBeenCalled();
      // consume は merge **より先**に立つ必要がある: mergeCustomerCommand は
      // source Customer を物理削除し、PendingCustomerMerge の onDelete: Cascade が
      // 行を消すため、merge 後の update は P2025 で必ず失敗する（本テストの順序
      // assertion がその regression を検出する）。
      const updateOrder = mockPendingUpdate.mock.invocationCallOrder[0];
      const mergeOrder = mockMergeCustomerCommand.mock.invocationCallOrder[0];
      expect(updateOrder).toBeLessThan(mergeOrder);
    });

    test("merge 失敗時は TX ごと rollback され token を消費しない", async () => {
      const rawToken = "consume-fail-token";
      mockPendingFindUnique
        .mockResolvedValueOnce({
          id: PENDING_ID,
          targetCustomerId: TARGET_ID,
          sourceCustomerId: SOURCE_ID,
          guestEmail: EMAIL,
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        })
        .mockResolvedValueOnce({
          id: PENDING_ID,
          targetCustomerId: TARGET_ID,
          sourceCustomerId: SOURCE_ID,
          guestEmail: EMAIL,
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        });

      mockCustomerFindUnique.mockResolvedValue({
        id: SOURCE_ID,
        userId: null,
        email: EMAIL,
        emailCanonical: EMAIL,
        anonymizedAt: null,
      });
      mockMergeCustomerCommand.mockRejectedValueOnce(new Error("merge failed"));

      await expect(
        consumeCustomerMergeTokenCommand(rawToken, TARGET_ID),
      ).rejects.toThrow("merge failed");
      // consume(update) と merge は同一 TX。merge の throw は TX 全体を rollback する
      // ため、実 DB では consumedAt も残らず token は消費されない（再試行可能）。
      // mock は rollback を再現できないので、ここでは「merge の例外がそのまま
      // 呼び出し元に伝播する（= TX が rollback する）」ことだけを検証する。
    });

    test("linked 状態変更後は VALIDATION", async () => {
      mockPendingFindUnique.mockResolvedValueOnce({
        id: PENDING_ID,
        targetCustomerId: TARGET_ID,
        sourceCustomerId: SOURCE_ID,
        guestEmail: EMAIL,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      });
      mockCustomerFindUnique.mockResolvedValueOnce({
        id: SOURCE_ID,
        userId: USER_ID,
        email: EMAIL,
        emailCanonical: EMAIL,
        anonymizedAt: null,
      });

      await expect(
        consumeCustomerMergeTokenCommand("linked-change", TARGET_ID),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });
  });

  test("CUSTOMER_MERGE_TOKEN_TTL_MS は 1 時間", () => {
    expect(CUSTOMER_MERGE_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
  });
});
