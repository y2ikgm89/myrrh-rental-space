import { beforeEach, describe, expect, mock, test } from "bun:test";

const PaymentStatus = {
  UNPAID: "UNPAID",
  PENDING: "PENDING",
  PAID: "PAID",
  REFUNDED: "REFUNDED",
  FAILED: "FAILED",
} as const;

const ReservationStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const;

const mockReservationFindMany = mock<
  (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>
>(() => Promise.resolve([]));
const mockReservationUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));
const mockCreateAuditLogRecord = mock<
  (args: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
const mockLogError = mock(() => undefined);

mock.module("server-only", () => ({}));
// @generated/prisma/enums は mock せず実 module を使う: helpers.ts が SocialPlatform 等を
// 経由して full enum を要求するため、部分 mock だと downstream import が壊れる。
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      findMany: mockReservationFindMany,
      updateMany: mockReservationUpdateMany,
    },
  },
}));
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mockCreateAuditLogRecord,
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { HIGH: "HIGH" },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const {
  expireStalePendingReservationsCommand,
  PENDING_RESERVATION_EXPIRY_MINUTES,
} = await import("@/shared/domain/reservations/pending-expiry");

describe("expireStalePendingReservationsCommand (Codex P1: PR#1042 fix)", () => {
  beforeEach(() => {
    mockReservationFindMany.mockReset();
    mockReservationUpdateMany.mockReset();
    mockCreateAuditLogRecord.mockReset();
    mockLogError.mockReset();

    mockReservationFindMany.mockResolvedValue([]);
    mockReservationUpdateMany.mockResolvedValue({ count: 0 });
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("predicate: paymentStatus=PENDING + status ∈ {PENDING, CONFIRMED} + paymentInitiatedAt < cutoff", async () => {
    await expireStalePendingReservationsCommand();

    expect(mockReservationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          },
          paymentStatus: PaymentStatus.PENDING,
          paymentInitiatedAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      }),
    );
  });

  test("空の候補セットなら early return: updateMany / audit log とも未呼出", async () => {
    mockReservationFindMany.mockResolvedValueOnce([]);
    const result = await expireStalePendingReservationsCommand();

    expect(result.total).toBe(0);
    expect(result.expired).toEqual([]);
    expect(mockReservationUpdateMany).not.toHaveBeenCalled();
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
  });

  test("claim data: status=CANCELLED + cancelledByType=SYSTEM + icsSequence increment", async () => {
    mockReservationFindMany
      .mockResolvedValueOnce([
        {
          id: "res-1",
          customerId: "cust-1",
          spaceId: "space-1",
          paymentInitiatedAt: new Date(0),
        },
      ])
      .mockResolvedValueOnce([]); // settled findMany
    mockReservationUpdateMany.mockResolvedValueOnce({ count: 1 });

    await expireStalePendingReservationsCommand();

    expect(mockReservationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          },
          paymentStatus: PaymentStatus.PENDING,
          paymentInitiatedAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
        data: expect.objectContaining({
          status: ReservationStatus.CANCELLED,
          cancelledByType: "SYSTEM",
          icsSequence: { increment: 1 },
        }),
      }),
    );
  });

  test("ageMinutes は paymentInitiatedAt から計算される (createdAt ではない)", async () => {
    const now = Date.now();
    // 90分前に checkout が開始された想定
    const paymentInitiatedAt = new Date(now - 90 * 60 * 1000);
    mockReservationFindMany
      .mockResolvedValueOnce([
        {
          id: "res-1",
          customerId: "cust-1",
          spaceId: "space-1",
          paymentInitiatedAt,
        },
      ])
      .mockResolvedValueOnce([
        { id: "res-1", customerId: "cust-1", spaceId: "space-1" },
      ]);
    mockReservationUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await expireStalePendingReservationsCommand();

    expect(result.total).toBe(1);
    expect(result.expired[0]?.ageMinutes).toBeGreaterThanOrEqual(89);
    expect(result.expired[0]?.ageMinutes).toBeLessThanOrEqual(91);
  });

  test("PENDING_RESERVATION_EXPIRY_MINUTES は 60 (Stripe session expires_at と同期する SSoT)", () => {
    // payment-commands.ts が Stripe session.expires_at をこの定数から計算するため、
    // 変更する場合は silent orphan (cron が生きた session を CANCELLED にする window) の
    // 副作用を認識した上で意図的に行うこと。
    expect(PENDING_RESERVATION_EXPIRY_MINUTES).toBe(60);
  });
});
