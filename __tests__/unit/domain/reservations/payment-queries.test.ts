import { describe, test, expect, mock, beforeEach } from "bun:test";

// PaymentStatus 定数（@generated/prisma/enums から Prisma enum を再現）
const PaymentStatus = {
  UNPAID: "UNPAID",
  PENDING: "PENDING",
  PAID: "PAID",
  REFUNDED: "REFUNDED",
  FAILED: "FAILED",
} as const;
type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

// Prisma モック関数（mock.module より先に定義）
const mockReservationFindUnique = mock<
  () => Promise<{ id: string; paymentStatus: PaymentStatus } | null>
>(() => Promise.resolve(null));

const mockReservationFindFirst = mock<
  () => Promise<{ id: string; paymentStatus: PaymentStatus } | null>
>(() => Promise.resolve(null));

const mockReservationUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "reservation-1" }),
);

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      findUnique: mockReservationFindUnique,
      findFirst: mockReservationFindFirst,
      update: mockReservationUpdate,
    },
  },
}));

mock.module("@generated/prisma/enums", () => ({
  PaymentStatus,
}));

import {
  getReservationPaymentStatus,
  updateReservationPaymentCompleted,
  markReservationPaymentFailed,
  findReservationByPaymentIntent,
  savePaymentIntentId,
  markReservationRefunded,
} from "@/shared/domain/reservations/payment-queries";

// テストデータ
const RESERVATION_ID = "550e8400-e29b-41d4-a716-446655440001";
const PAYMENT_INTENT_ID = "pi_test_1234567890";

describe("reservations/payment-queries", () => {
  beforeEach(() => {
    mockReservationFindUnique.mockReset();
    mockReservationFindFirst.mockReset();
    mockReservationUpdate.mockReset();

    // デフォルト戻り値
    mockReservationFindUnique.mockResolvedValue(null);
    mockReservationFindFirst.mockResolvedValue(null);
    mockReservationUpdate.mockResolvedValue({ id: RESERVATION_ID });
  });

  // =============================================================================
  // getReservationPaymentStatus
  // =============================================================================

  describe("getReservationPaymentStatus", () => {
    describe("正常系", () => {
      test("存在する予約の paymentStatus を取得できる", async () => {
        mockReservationFindUnique.mockResolvedValueOnce({
          id: RESERVATION_ID,
          paymentStatus: PaymentStatus.PENDING,
        });

        const result = await getReservationPaymentStatus(RESERVATION_ID);

        expect(result).toEqual({
          id: RESERVATION_ID,
          paymentStatus: PaymentStatus.PENDING,
        });
      });

      test("findUnique が deletedAt: null 条件で呼ばれる", async () => {
        mockReservationFindUnique.mockResolvedValueOnce({
          id: RESERVATION_ID,
          paymentStatus: PaymentStatus.PAID,
        });

        await getReservationPaymentStatus(RESERVATION_ID);

        expect(mockReservationFindUnique).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: RESERVATION_ID, deletedAt: null },
            select: { id: true, paymentStatus: true },
          }),
        );
      });

      test("各 paymentStatus 値を正しく返す", async () => {
        for (const status of Object.values(PaymentStatus)) {
          mockReservationFindUnique.mockResolvedValueOnce({
            id: RESERVATION_ID,
            paymentStatus: status,
          });

          const result = await getReservationPaymentStatus(RESERVATION_ID);

          expect(result?.paymentStatus).toBe(status);
        }
      });
    });

    describe("異常系", () => {
      test("存在しない予約 ID で null を返す", async () => {
        mockReservationFindUnique.mockResolvedValueOnce(null);

        const result = await getReservationPaymentStatus(RESERVATION_ID);

        expect(result).toBeNull();
      });
    });
  });

  // =============================================================================
  // updateReservationPaymentCompleted
  // =============================================================================

  describe("updateReservationPaymentCompleted", () => {
    describe("正常系", () => {
      test("paymentStatus を PAID に更新し、決済情報を返す", async () => {
        const mockReservationData = {
          id: RESERVATION_ID,
          startTime: new Date("2024-03-01T10:00:00Z"),
          endTime: new Date("2024-03-01T12:00:00Z"),
          totalPrice: 5000,
          notes: null,
          paymentStatus: PaymentStatus.PAID,
          icsSequence: 0,
          customer: {
            email: "customer@example.com",
            lastName: "田中",
            firstName: "太郎",
          },
          space: {
            name: "テストスペース",
            location: { name: "渋谷" },
          },
        };
        mockReservationUpdate.mockResolvedValueOnce(mockReservationData);

        const result = await updateReservationPaymentCompleted(RESERVATION_ID, {
          stripePaymentIntentId: PAYMENT_INTENT_ID,
        });

        expect(result).toEqual(mockReservationData);
      });

      test("paymentStatus: PAID、stripePaymentIntentId、paidAt で update が呼ばれる", async () => {
        mockReservationUpdate.mockResolvedValueOnce({
          id: RESERVATION_ID,
          paymentStatus: PaymentStatus.PAID,
        });

        await updateReservationPaymentCompleted(RESERVATION_ID, {
          stripePaymentIntentId: PAYMENT_INTENT_ID,
        });

        expect(mockReservationUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: RESERVATION_ID, deletedAt: null },
            data: expect.objectContaining({
              paymentStatus: PaymentStatus.PAID,
              stripePaymentIntentId: PAYMENT_INTENT_ID,
              paidAt: expect.any(Date),
            }),
          }),
        );
      });

      test("stripePaymentIntentId が null でも更新できる", async () => {
        mockReservationUpdate.mockResolvedValueOnce({
          id: RESERVATION_ID,
          paymentStatus: PaymentStatus.PAID,
        });

        await updateReservationPaymentCompleted(RESERVATION_ID, {
          stripePaymentIntentId: null,
        });

        expect(mockReservationUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              paymentStatus: PaymentStatus.PAID,
              stripePaymentIntentId: null,
            }),
          }),
        );
      });
    });
  });

  // =============================================================================
  // markReservationPaymentFailed
  // =============================================================================

  describe("markReservationPaymentFailed", () => {
    describe("正常系", () => {
      test("paymentStatus を FAILED に更新できる", async () => {
        mockReservationUpdate.mockResolvedValueOnce({
          id: RESERVATION_ID,
          paymentStatus: PaymentStatus.FAILED,
        });

        const result = await markReservationPaymentFailed(RESERVATION_ID);

        expect(result).toEqual(expect.objectContaining({ id: RESERVATION_ID }));
      });

      test("paymentStatus: FAILED と deletedAt: null 条件で update が呼ばれる", async () => {
        mockReservationUpdate.mockResolvedValueOnce({ id: RESERVATION_ID });

        await markReservationPaymentFailed(RESERVATION_ID);

        expect(mockReservationUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: RESERVATION_ID, deletedAt: null },
            data: { paymentStatus: PaymentStatus.FAILED },
          }),
        );
      });
    });
  });

  // =============================================================================
  // findReservationByPaymentIntent
  // =============================================================================

  describe("findReservationByPaymentIntent", () => {
    describe("正常系", () => {
      test("stripePaymentIntentId に一致する予約を返す", async () => {
        mockReservationFindFirst.mockResolvedValueOnce({
          id: RESERVATION_ID,
          paymentStatus: PaymentStatus.PENDING,
        });

        const result = await findReservationByPaymentIntent(PAYMENT_INTENT_ID);

        expect(result).toEqual({
          id: RESERVATION_ID,
          paymentStatus: PaymentStatus.PENDING,
        });
      });

      test("stripePaymentIntentId と deletedAt: null の条件で findFirst が呼ばれる", async () => {
        mockReservationFindFirst.mockResolvedValueOnce({
          id: RESERVATION_ID,
          paymentStatus: PaymentStatus.PAID,
        });

        await findReservationByPaymentIntent(PAYMENT_INTENT_ID);

        expect(mockReservationFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              stripePaymentIntentId: PAYMENT_INTENT_ID,
              deletedAt: null,
            },
            select: { id: true, paymentStatus: true },
          }),
        );
      });
    });

    describe("異常系", () => {
      test("一致する予約が存在しない場合 null を返す", async () => {
        mockReservationFindFirst.mockResolvedValueOnce(null);

        const result = await findReservationByPaymentIntent("pi_unknown");

        expect(result).toBeNull();
      });
    });
  });

  // =============================================================================
  // savePaymentIntentId
  // =============================================================================

  describe("savePaymentIntentId", () => {
    describe("正常系", () => {
      test("stripePaymentIntentId を保存できる", async () => {
        mockReservationUpdate.mockResolvedValueOnce({
          id: RESERVATION_ID,
          stripePaymentIntentId: PAYMENT_INTENT_ID,
        });

        const result = await savePaymentIntentId(
          RESERVATION_ID,
          PAYMENT_INTENT_ID,
        );

        expect(result).toEqual(expect.objectContaining({ id: RESERVATION_ID }));
      });

      test("stripePaymentIntentId のみを更新（paymentStatus は変更しない）", async () => {
        mockReservationUpdate.mockResolvedValueOnce({ id: RESERVATION_ID });

        await savePaymentIntentId(RESERVATION_ID, PAYMENT_INTENT_ID);

        expect(mockReservationUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: RESERVATION_ID, deletedAt: null },
            data: { stripePaymentIntentId: PAYMENT_INTENT_ID },
          }),
        );
      });

      test("update の data に paymentStatus が含まれない", async () => {
        mockReservationUpdate.mockResolvedValueOnce({ id: RESERVATION_ID });

        await savePaymentIntentId(RESERVATION_ID, PAYMENT_INTENT_ID);

        expect(mockReservationUpdate).toHaveBeenCalledWith(
          expect.not.objectContaining({
            data: expect.objectContaining({ paymentStatus: expect.anything() }),
          }),
        );
      });
    });
  });

  // =============================================================================
  // markReservationRefunded
  // =============================================================================

  describe("markReservationRefunded", () => {
    describe("正常系", () => {
      test("paymentStatus を REFUNDED に更新できる", async () => {
        mockReservationUpdate.mockResolvedValueOnce({
          id: RESERVATION_ID,
          paymentStatus: PaymentStatus.REFUNDED,
        });

        const result = await markReservationRefunded(RESERVATION_ID);

        expect(result).toEqual(expect.objectContaining({ id: RESERVATION_ID }));
      });

      test("paymentStatus: REFUNDED と deletedAt: null 条件で update が呼ばれる", async () => {
        mockReservationUpdate.mockResolvedValueOnce({ id: RESERVATION_ID });

        await markReservationRefunded(RESERVATION_ID);

        expect(mockReservationUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: RESERVATION_ID, deletedAt: null },
            data: { paymentStatus: PaymentStatus.REFUNDED },
          }),
        );
      });
    });
  });

  // =============================================================================
  // ソフトデリートガード: 全関数が deletedAt: null を条件に含む
  // =============================================================================

  describe("ソフトデリートガード", () => {
    test("getReservationPaymentStatus は削除済み予約（deletedAt != null）を除外する", async () => {
      mockReservationFindUnique.mockResolvedValueOnce(null);

      await getReservationPaymentStatus(RESERVATION_ID);

      expect(mockReservationFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    test("updateReservationPaymentCompleted は削除済み予約を操作しない", async () => {
      mockReservationUpdate.mockResolvedValueOnce({ id: RESERVATION_ID });

      await updateReservationPaymentCompleted(RESERVATION_ID, {
        stripePaymentIntentId: PAYMENT_INTENT_ID,
      });

      expect(mockReservationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    test("markReservationPaymentFailed は削除済み予約を操作しない", async () => {
      mockReservationUpdate.mockResolvedValueOnce({ id: RESERVATION_ID });

      await markReservationPaymentFailed(RESERVATION_ID);

      expect(mockReservationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    test("findReservationByPaymentIntent は削除済み予約を除外する", async () => {
      mockReservationFindFirst.mockResolvedValueOnce(null);

      await findReservationByPaymentIntent(PAYMENT_INTENT_ID);

      expect(mockReservationFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    test("savePaymentIntentId は削除済み予約を操作しない", async () => {
      mockReservationUpdate.mockResolvedValueOnce({ id: RESERVATION_ID });

      await savePaymentIntentId(RESERVATION_ID, PAYMENT_INTENT_ID);

      expect(mockReservationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    test("markReservationRefunded は削除済み予約を操作しない", async () => {
      mockReservationUpdate.mockResolvedValueOnce({ id: RESERVATION_ID });

      await markReservationRefunded(RESERVATION_ID);

      expect(mockReservationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });
  });
});
