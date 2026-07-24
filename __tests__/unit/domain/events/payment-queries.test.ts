import { beforeEach, describe, expect, mock, test } from "bun:test";

const PaymentStatus = {
  UNPAID: "UNPAID",
  PENDING: "PENDING",
  PAID: "PAID",
  REFUNDED: "REFUNDED",
  FAILED: "FAILED",
} as const;

const mockRegFindFirst = mock<
  (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockRegUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

mock.module("server-only", () => ({}));

mock.module("@generated/prisma/enums", () => ({
  PaymentStatus,
  RegistrationStatus: {
    CONFIRMED: "CONFIRMED",
    EXPIRED: "EXPIRED",
  },
}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    eventRegistration: {
      findFirst: mockRegFindFirst,
      updateMany: mockRegUpdateMany,
    },
  },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const { claimEventRegistrationAsFailed } =
  await import("@/shared/domain/events/payment-queries");

const REGISTRATION_ID = "550e8400-e29b-41d4-a716-446655440101";

describe("events/payment-queries", () => {
  beforeEach(() => {
    mockRegFindFirst.mockClear();
    mockRegUpdateMany.mockClear();
    mockRegUpdateMany.mockResolvedValue({ count: 0 });
  });

  describe("claimEventRegistrationAsFailed", () => {
    test("WHERE に stripeCheckoutSessionId 一致必須 + paymentStatus notIn [PAID, REFUNDED, FAILED]、data は FAILED", async () => {
      mockRegUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await claimEventRegistrationAsFailed(
        REGISTRATION_ID,
        "cs_matching_session",
      );

      expect(result).toBe(true);
      expect(mockRegUpdateMany).toHaveBeenCalledWith({
        where: {
          id: REGISTRATION_ID,
          stripeCheckoutSessionId: "cs_matching_session",
          paymentStatus: {
            notIn: [
              PaymentStatus.PAID,
              PaymentStatus.REFUNDED,
              PaymentStatus.FAILED,
            ],
          },
        },
        data: { paymentStatus: PaymentStatus.FAILED },
      });
    });

    test("sessionId 不一致 (stale webhook) → count=0 で false を返す", async () => {
      // 24h offer window 内で顧客が cancel → 再 checkout した場合、
      // 前回の checkout.session.expired が遅れて到達しても、
      // stripeCheckoutSessionId は新 session に更新済み。sessionId gate 一致
      // 無しで DB は 0 行更新、false を返す (= 新 PENDING を巻き込まない)。
      mockRegUpdateMany.mockResolvedValueOnce({ count: 0 });

      const result = await claimEventRegistrationAsFailed(
        REGISTRATION_ID,
        "cs_stale_session",
      );

      expect(result).toBe(false);
      // 呼び出し自体は起き、WHERE に sessionId が入っていることを確認
      expect(mockRegUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stripeCheckoutSessionId: "cs_stale_session",
          }),
        }),
      );
    });

    test("sessionId 一致 + eligible paymentStatus → count=1 で true", async () => {
      mockRegUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await claimEventRegistrationAsFailed(
        REGISTRATION_ID,
        "cs_matching_session",
      );

      expect(result).toBe(true);
    });
  });
});
