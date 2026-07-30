import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installEmailLibDispatchMock } from "../../support/email-lib-dispatch-mock";

const mockExecuteAdminMutationResult = mock();
const mockRefundReservationPaymentCommand = mock();
const mockCreateNotificationCommand = mock(async () => undefined);
const mockSendReservationRefundEmail = mock(async () => ({ ok: true }));
const mockFetchReservationEmailData = mock();
const mockInvalidateReservationCaches = mock(() => undefined);
const mockBuildAuditRequestContext = mock<
  () => Promise<{ ip: string | null; userAgent: string | null }>
>(() => Promise.resolve({ ip: null, userAgent: null }));

mock.module("next/headers", () => ({
  headers: mock(() => Promise.resolve(new Headers())),
}));
mock.module("next/cache", () => ({
  cacheLife: mock(() => undefined),
  cacheTag: mock(() => undefined),
  revalidateTag: mock(() => undefined),
  updateTag: mock(() => undefined),
}));
mock.module("server-only", () => ({}));

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: (
    ...args: Parameters<typeof mockExecuteAdminMutationResult>
  ) => mockExecuteAdminMutationResult(...args),
}));

mock.module("@/shared/lib/cache/reservation-cache", () => ({
  invalidateReservationCaches: (
    ...args: Parameters<typeof mockInvalidateReservationCaches>
  ) => mockInvalidateReservationCaches(...args),
}));

// payment.ts の module-top-level import 全てを解決可能にする必要があるため
// (reservation-cancellation-reason.test.ts と同型の網羅 mock)、この action ファイルが
// import する @/shared/domain/reservations/payment-commands の named export を
// 全て provide する（refundReservationPaymentCommand 以外は本テストでは未使用）。
mock.module("@/shared/domain/reservations/payment-commands", () => ({
  createCheckoutSessionCommand: mock(),
  recordManualReservationPaymentCommand: mock(),
  refundReservationPaymentCommand: (
    ...args: Parameters<typeof mockRefundReservationPaymentCommand>
  ) => mockRefundReservationPaymentCommand(...args),
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mock(async () => undefined),
}));

mock.module("@/shared/domain/reservations/payloads", () => ({
  fetchReservationEmailData: (
    ...args: Parameters<typeof mockFetchReservationEmailData>
  ) => mockFetchReservationEmailData(...args),
}));

mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: () => mockBuildAuditRequestContext(),
}));

// fireAndForget は本来 await しない設計だが、テストでは afterSuccess 内で発火された
// 副作用 Promise を捕まえて明示的に await できるよう、実行開始済みの Promise を
// 配列に積むだけの stub に差し替える (admin-event-registration.test.ts と同型)。
const firedPromises: Promise<unknown>[] = [];
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    firedPromises.push(promise.catch(() => undefined));
  },
}));

installEmailLibDispatchMock({
  sendReservationRefundEmail: (
    ...args: Parameters<typeof mockSendReservationRefundEmail>
  ) => mockSendReservationRefundEmail(...args),
});

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: (
    ...args: Parameters<typeof mockCreateNotificationCommand>
  ) => mockCreateNotificationCommand(...args),
}));

const { refundReservationPayment } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/reservation/payment");
const { PaymentStatus } =
  await import("@/shared/lib/validations/enums/prisma-types");

const RESERVATION_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440002";

describe("refundReservationPayment: isSettled skip", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockRefundReservationPaymentCommand.mockReset();
    mockCreateNotificationCommand.mockReset();
    mockSendReservationRefundEmail.mockReset();
    mockFetchReservationEmailData.mockReset();
    mockInvalidateReservationCaches.mockReset();
    mockBuildAuditRequestContext.mockReset();
    firedPromises.length = 0;

    mockCreateNotificationCommand.mockResolvedValue(undefined);
    mockSendReservationRefundEmail.mockResolvedValue({ ok: true });
    mockFetchReservationEmailData.mockResolvedValue({
      reservationId: RESERVATION_ID,
      customerEmail: "customer@example.com",
      customerName: "山田太郎",
      spaceName: "テストスペース",
      startTime: new Date("2027-01-01T00:00:00.000Z"),
      endTime: new Date("2027-01-01T02:00:00.000Z"),
      totalPrice: 5000,
      totalPriceWithTax: 5500,
      userId: null,
    });
    mockInvalidateReservationCaches.mockReturnValue(undefined);
    mockBuildAuditRequestContext.mockResolvedValue({
      ip: "203.0.113.1",
      userAgent: "test-agent",
    });
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute({ id: "admin-1" });
      await options.afterSuccess?.(data);
      return data;
    });
  });

  test("isSettled=false の間は sendReservationRefundEmail も createNotificationCommand も呼ばれない", async () => {
    mockRefundReservationPaymentCommand.mockResolvedValue({
      refundId: "re_test_pending",
      status: "pending",
      customerId: CUSTOMER_ID,
      newPaymentStatus: PaymentStatus.REFUNDED,
      isSettled: false,
      cumulativeAmount: 5000,
      refundAmount: 5000,
    });

    await refundReservationPayment(RESERVATION_ID);
    await Promise.allSettled(firedPromises);

    // invalidateReservationCaches は isSettled に関わらず常に実行される
    expect(mockInvalidateReservationCaches).toHaveBeenCalledWith(
      RESERVATION_ID,
      CUSTOMER_ID,
    );
    expect(mockSendReservationRefundEmail).not.toHaveBeenCalled();
    expect(mockCreateNotificationCommand).not.toHaveBeenCalled();
  });

  test("isSettled=true なら sendReservationRefundEmail と createNotificationCommand が呼ばれる", async () => {
    mockRefundReservationPaymentCommand.mockResolvedValue({
      refundId: "re_test_settled",
      status: "succeeded",
      customerId: CUSTOMER_ID,
      newPaymentStatus: PaymentStatus.REFUNDED,
      isSettled: true,
      cumulativeAmount: 5000,
      refundAmount: 5000,
    });

    await refundReservationPayment(RESERVATION_ID);
    await Promise.allSettled(firedPromises);

    expect(mockSendReservationRefundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: RESERVATION_ID,
        refundId: "re_test_settled",
      }),
    );
    expect(mockCreateNotificationCommand).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: RESERVATION_ID }),
    );
  });
});
