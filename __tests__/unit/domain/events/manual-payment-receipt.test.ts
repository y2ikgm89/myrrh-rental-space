/**
 * recordManualEventPaymentCommand の手動入金後領収書発行 + 通知配線。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

const PaymentStatus = {
  UNPAID: "UNPAID",
  PAID: "PAID",
} as const;

const RegistrationStatus = {
  CONFIRMED: "CONFIRMED",
} as const;

const REGISTRATION_ID = "reg_manual_pay_001";
const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440201";

const mockRegFindUnique = mock<
  (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockRegUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

const mockIssueReceipt = mock(
  (_registrationId: string, _options?: { source?: string }) =>
    Promise.resolve({
      id: "receipt-event-1",
      serialNo: "2026-000101",
    }),
);
const mockNotify = mock((_input: { receiptId: string; detailUrl: string }) =>
  Promise.resolve({ ok: true as const, messageId: "msg_e1" }),
);
const mockFireAndForget = mock(
  (promise: Promise<unknown>, _options?: unknown) => {
    void promise.catch(() => undefined);
  },
);
const mockCreateEventRegistrationStatusToken = mock(
  (_registrationId: string, _expiresAt: Date) => "STATUS_TOKEN_TEST",
);
const mockLogError = mock(() => undefined);

mock.module("server-only", () => ({}));
mock.module("@generated/prisma/enums", () => ({
  AuditAction: { UPDATE: "UPDATE" },
  PaymentStatus,
  RegistrationStatus,
}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    eventRegistration: {
      findUnique: mockRegFindUnique,
      updateMany: mockRegUpdateMany,
    },
  },
}));
mock.module("@/shared/lib/constants", () => ({
  getAppUrl: () => "https://example.com",
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: {
    EXTERNAL_API: "EXTERNAL_API",
    DATABASE: "DATABASE",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mockFireAndForget,
}));
mock.module("@/shared/domain/receipts/issue", () => ({
  issueReceiptForEventRegistration: mockIssueReceipt,
}));
mock.module("@/shared/domain/receipts/notify-issued", () => ({
  notifyReceiptIssuedForEventRegistration: mockNotify,
}));
mock.module("@/shared/lib/event-registration-status-token", () => ({
  createEventRegistrationStatusToken: mockCreateEventRegistrationStatusToken,
  EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS: 90 * 24 * 60 * 60 * 1000,
}));
// Unused by this suite but imported by payment-commands module graph.
mock.module("@/shared/domain/payment/availability", () => ({
  assertOnlinePaymentAvailable: () => Promise.resolve({}),
  assertStripeCredentialsConfigured: () => Promise.resolve({}),
}));
mock.module("@/shared/lib/stripe", () => ({
  getStripeClient: () => Promise.resolve({ client: null }),
}));
const actualStripePaymentMethods =
  await import("@/shared/lib/stripe-payment-methods");
mock.module("@/shared/lib/stripe-payment-methods", () => ({
  ...actualStripePaymentMethods,
  isStripePaymentMethodType: () => true,
}));
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: () => Promise.resolve(),
}));
mock.module("@/shared/lib/prisma-errors", () => ({
  isPrismaUniqueConstraintError: () => false,
}));
mock.module("@/shared/lib/validations/enums/refund-attribution", () => ({
  REFUNDED_BY_TYPE: { ADMIN: "ADMIN" },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const { recordManualEventPaymentCommand } =
  await import("@/shared/domain/events/payment-commands");
// eslint-disable-next-line import-x/first -- mock.module must precede imports
const {
  MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING,
  MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING,
} = await import("@/shared/domain/receipts/manual-payment-warnings");

function unpaidRegistration(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    paymentStatus: PaymentStatus.UNPAID,
    stripeCheckoutSessionId: null,
    customerId: null,
    quantity: 1,
    ticket: { price: 1000 },
    ...overrides,
  };
}

describe("recordManualEventPaymentCommand — receipt issue + notify", () => {
  beforeEach(() => {
    mockRegFindUnique.mockReset();
    mockRegUpdateMany.mockReset();
    mockIssueReceipt.mockReset();
    mockIssueReceipt.mockResolvedValue({
      id: "receipt-event-1",
      serialNo: "2026-000101",
    });
    mockNotify.mockReset();
    mockNotify.mockResolvedValue({ ok: true, messageId: "msg_e1" });
    mockFireAndForget.mockReset();
    mockFireAndForget.mockImplementation(
      (promise: Promise<unknown>, _options?: unknown) => {
        void promise.catch(() => undefined);
      },
    );
    mockCreateEventRegistrationStatusToken.mockReset();
    mockCreateEventRegistrationStatusToken.mockReturnValue("STATUS_TOKEN_TEST");
    mockLogError.mockReset();
  });

  test("issues receipt with manual-payment source and notifies guest via status URL", async () => {
    mockRegFindUnique.mockResolvedValue(unpaidRegistration());
    mockRegUpdateMany.mockResolvedValue({ count: 1 });

    const result = await recordManualEventPaymentCommand({
      registrationId: REGISTRATION_ID,
      amount: 1000,
    });

    expect(result).toEqual({ registrationId: REGISTRATION_ID });
    expect(mockIssueReceipt).toHaveBeenCalledWith(REGISTRATION_ID, {
      source: "manual-payment",
    });
    expect(mockCreateEventRegistrationStatusToken).toHaveBeenCalledWith(
      REGISTRATION_ID,
      expect.any(Date),
    );
    expect(mockNotify).toHaveBeenCalledWith({
      receiptId: "receipt-event-1",
      detailUrl: `https://example.com/events/registrations/status?token=STATUS_TOKEN_TEST`,
    });
  });

  test("member (customerId) detailUrl uses /mypage/events/{id}", async () => {
    mockRegFindUnique.mockResolvedValue(
      unpaidRegistration({ customerId: CUSTOMER_ID }),
    );
    mockRegUpdateMany.mockResolvedValue({ count: 1 });

    await recordManualEventPaymentCommand({
      registrationId: REGISTRATION_ID,
      amount: 1000,
    });

    expect(mockNotify).toHaveBeenCalledWith({
      receiptId: "receipt-event-1",
      detailUrl: `https://example.com/mypage/events/${REGISTRATION_ID}`,
    });
    expect(mockCreateEventRegistrationStatusToken).not.toHaveBeenCalled();
  });

  test("VALIDATION receipt error keeps PAID and returns receiptWarning", async () => {
    mockRegFindUnique.mockResolvedValue(unpaidRegistration());
    mockRegUpdateMany.mockResolvedValue({ count: 1 });
    mockIssueReceipt.mockRejectedValue(
      new DomainError("金額 0 は発行しません", "VALIDATION"),
    );

    const result = await recordManualEventPaymentCommand({
      registrationId: REGISTRATION_ID,
      amount: 1000,
    });

    expect(result).toEqual({
      registrationId: REGISTRATION_ID,
      receiptWarning: MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING,
    });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  test("unexpected receipt error keeps PAID and returns deferred warning", async () => {
    mockRegFindUnique.mockResolvedValue(unpaidRegistration());
    mockRegUpdateMany.mockResolvedValue({ count: 1 });
    mockIssueReceipt.mockRejectedValue(new Error("db down"));

    const result = await recordManualEventPaymentCommand({
      registrationId: REGISTRATION_ID,
      amount: 1000,
    });

    expect(result).toEqual({
      registrationId: REGISTRATION_ID,
      receiptWarning: MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING,
    });
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
