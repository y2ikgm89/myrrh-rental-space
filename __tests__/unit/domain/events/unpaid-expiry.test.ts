import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";

const PaymentStatus = {
  UNPAID: "UNPAID",
  PENDING: "PENDING",
  PAID: "PAID",
  REFUNDED: "REFUNDED",
  FAILED: "FAILED",
} as const;

const RegistrationStatus = {
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
} as const;

const mockEventRegistrationFindMany = mock<
  (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>
>(() => Promise.resolve([]));
const mockEventRegistrationUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));
const mockExecuteRaw = mock(() => Promise.resolve(undefined));
const mockOfferNextWaitlistEntryCommand = mock<
  (tx: unknown, args: Record<string, unknown>) => Promise<{ promoted: null }>
>(() => Promise.resolve({ promoted: null }));
const mockApplyEventRegistrationCancellationSideEffects = mock<
  (args: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
const mockExpireOpenCheckoutSessionBestEffort = mock<
  (args: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
const mockAssertStripeCredentialsConfigured = mock<
  () => Promise<{ stripeSecretKey: string }>
>(() => Promise.resolve({ stripeSecretKey: "sk_test" }));
const mockSessionsExpire = mock<(id: string) => Promise<unknown>>(() =>
  Promise.resolve({}),
);
const mockGetStripeClient = mock(() =>
  Promise.resolve({
    client: { checkout: { sessions: { expire: mockSessionsExpire } } },
  }),
);
const mockLogError = mock(() => undefined);

const txClient = {
  $executeRaw: mockExecuteRaw,
  eventRegistration: {
    updateMany: mockEventRegistrationUpdateMany,
  },
};

const mockTransaction = mock<
  (fn: (tx: typeof txClient) => Promise<unknown>) => Promise<unknown>
>((fn) => fn(txClient));

mock.module("server-only", () => ({}));
await installPrismaEnumsMock({ PaymentStatus, RegistrationStatus });
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    eventRegistration: {
      findMany: mockEventRegistrationFindMany,
    },
    $transaction: mockTransaction,
  },
}));
mock.module("@/shared/domain/events/waitlist-commands", () => ({
  offerNextWaitlistEntryCommand: (tx: unknown, args: Record<string, unknown>) =>
    mockOfferNextWaitlistEntryCommand(tx, args),
}));
mock.module(
  "@/shared/domain/events/registration-cancellation-side-effects",
  () => ({
    applyEventRegistrationCancellationSideEffects:
      mockApplyEventRegistrationCancellationSideEffects,
  }),
);
mock.module("@/shared/domain/payment/checkout-session-expiry", () => ({
  expireOpenCheckoutSessionBestEffort: mockExpireOpenCheckoutSessionBestEffort,
}));
mock.module("@/shared/domain/payment/availability", () => ({
  assertStripeCredentialsConfigured: mockAssertStripeCredentialsConfigured,
}));
mock.module("@/shared/lib/stripe", () => ({
  getStripeClient: mockGetStripeClient,
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: { DATABASE: "DATABASE", EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { HIGH: "HIGH", LOW: "LOW" },
}));
mock.module("@/shared/lib/validations/enums/helpers", () => ({
  CANCELLED_BY: {
    SYSTEM: "SYSTEM",
    ADMIN: "ADMIN",
    CUSTOMER_MYPAGE: "CUSTOMER_MYPAGE",
    CUSTOMER_TOKEN: "CUSTOMER_TOKEN",
  },
}));

const {
  expireStaleUnpaidEventRegistrationsCommand,
  UNPAID_EVENT_EXPIRE_SCAN_LIMIT,
} = await import("@/shared/domain/events/unpaid-expiry");
const { UNPAID_EVENT_REGISTRATION_EXPIRY_MINUTES } =
  await import("@/shared/domain/events/payment-expiry-constants");

const REGISTRATION_ID = "reg-stale-unpaid";
const EVENT_ID = "event-1";

function staleCandidate(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const staleCreatedAt = new Date(
    Date.now() - (UNPAID_EVENT_REGISTRATION_EXPIRY_MINUTES + 5) * 60_000,
  );
  return {
    id: REGISTRATION_ID,
    eventId: EVENT_ID,
    slotId: "slot-1",
    ticketId: "ticket-1",
    paymentStatus: PaymentStatus.UNPAID,
    createdAt: staleCreatedAt,
    updatedAt: staleCreatedAt,
    stripeCheckoutSessionId: null,
    ...overrides,
  };
}

describe("expireStaleUnpaidEventRegistrationsCommand", () => {
  beforeEach(() => {
    mockEventRegistrationFindMany.mockReset();
    mockEventRegistrationUpdateMany.mockReset();
    mockExecuteRaw.mockReset();
    mockOfferNextWaitlistEntryCommand.mockReset();
    mockApplyEventRegistrationCancellationSideEffects.mockReset();
    mockExpireOpenCheckoutSessionBestEffort.mockReset();
    mockTransaction.mockClear();
    mockOfferNextWaitlistEntryCommand.mockResolvedValue({ promoted: null });
    mockEventRegistrationUpdateMany.mockResolvedValue({ count: 1 });
  });

  test("候補 0 件なら空結果を返し tx を呼ばない", async () => {
    mockEventRegistrationFindMany.mockResolvedValueOnce([]);

    const result = await expireStaleUnpaidEventRegistrationsCommand();

    expect(result).toEqual({ expired: [], total: 0 });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  test("UNPAID + 有料チケット stale 行を atomic claim して CANCELLED 化し side effects を呼ぶ", async () => {
    mockEventRegistrationFindMany.mockResolvedValueOnce([staleCandidate()]);

    const result = await expireStaleUnpaidEventRegistrationsCommand();

    expect(result.total).toBe(1);
    expect(result.expired[0]?.id).toBe(REGISTRATION_ID);
    expect(mockEventRegistrationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: REGISTRATION_ID,
          status: RegistrationStatus.CONFIRMED,
          paymentStatus: {
            in: [
              PaymentStatus.UNPAID,
              PaymentStatus.PENDING,
              PaymentStatus.FAILED,
            ],
          },
        }),
        data: expect.objectContaining({
          status: RegistrationStatus.CANCELLED,
          cancelledByType: "SYSTEM",
        }),
      }),
    );
    expect(mockOfferNextWaitlistEntryCommand).toHaveBeenCalledTimes(1);
    expect(
      mockApplyEventRegistrationCancellationSideEffects,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId: REGISTRATION_ID,
        channel: "system",
        promoted: null,
      }),
    );
  });

  test("claim count=0 の race では side effects を呼ばない", async () => {
    mockEventRegistrationFindMany.mockResolvedValueOnce([staleCandidate()]);
    mockEventRegistrationUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await expireStaleUnpaidEventRegistrationsCommand();

    expect(result.total).toBe(0);
    expect(
      mockApplyEventRegistrationCancellationSideEffects,
    ).not.toHaveBeenCalled();
    expect(mockExpireOpenCheckoutSessionBestEffort).not.toHaveBeenCalled();
  });

  test("stripeCheckoutSessionId がある場合は expireOpenCheckoutSessionBestEffort を呼ぶ", async () => {
    mockEventRegistrationFindMany.mockResolvedValueOnce([
      staleCandidate({
        paymentStatus: PaymentStatus.PENDING,
        stripeCheckoutSessionId: "cs_test_pending",
        updatedAt: new Date(
          Date.now() - (UNPAID_EVENT_REGISTRATION_EXPIRY_MINUTES + 5) * 60_000,
        ),
      }),
    ]);

    await expireStaleUnpaidEventRegistrationsCommand();

    expect(mockExpireOpenCheckoutSessionBestEffort).toHaveBeenCalledWith({
      sessionId: "cs_test_pending",
      context: { registrationId: REGISTRATION_ID },
    });
  });

  /**
   * cron 走査は上限と順序を持つ（監査 A-36）。
   *
   * 旧実装は `take` も `orderBy` も無しに候補を全件取り、1 件ずつ
   * 「advisory lock 付きトランザクション + waitlist promote」を直列に回していた。
   * waitlist-expire だけが N-07 で 200 件に切られており、兵弟に伝播していなかった。
   */
  test("候補走査は take と orderBy（古い順）を持つ", async () => {
    mockEventRegistrationFindMany.mockResolvedValueOnce([]);

    await expireStaleUnpaidEventRegistrationsCommand();

    const args = mockEventRegistrationFindMany.mock.calls[0]?.[0] as {
      take?: number;
      orderBy?: Record<string, string>;
    };

    expect(args?.take).toBe(UNPAID_EVENT_EXPIRE_SCAN_LIMIT);
    expect(args?.orderBy).toEqual({ createdAt: "asc" });
  });
});
