/**
 * `refundEventRegistrationPaymentCommand` の実 DB 統合テスト。
 *
 * UA-HORIZ-04: refund command が `request?: { ip, userAgent }` を受け取り、
 * 指定時のみ AuditLog metadata に載せる (webhook / 未指定は後方互換で欠落) ことの検証。
 *
 * 他の挙動 (partial refund / advisory lock / paymentStatus 遷移) は Reservation 側
 * `refund-command.test.ts` が同型ロジックを網羅済みのため本ファイルでは扱わない。
 *
 * == 実行条件 ==
 * 実 Postgres を要求する (interactive tx 内の Refund child table 集計 + advisory lock は
 * mock 不能)。`bun run test:integration` は docker-compose の test-db 既定値を注入する。
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { EventScheduleMode, EventStatus } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  const url = new URL(TEST_DB_URL);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "20");
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "60");
  }
  process.env["DATABASE_URL"] = url.toString();
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// Stripe fake refund (実 Stripe に到達しない)
const mockRefundsCreate = mock<
  (
    args: Record<string, unknown>,
    opts?: { idempotencyKey?: string },
  ) => Promise<{ id: string; status: string }>
>(() => Promise.resolve({ id: "", status: "succeeded" }));

mock.module("@/shared/lib/stripe", () => ({
  getStripeClient: () =>
    Promise.resolve({
      client: {
        refunds: { create: mockRefundsCreate },
      },
    }),
}));

mock.module("@/shared/domain/payment/availability", () => ({
  assertOnlinePaymentAvailable: () =>
    Promise.resolve({
      stripeSecretKey: "sk_test_dummy",
      stripeWebhookSecret: "whsec_dummy",
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeCurrency: "jpy",
      stripePaymentMethodTypes: ["card"],
    }),
}));

// AuditLog: hash-chain の書込が実 DB を汚染するため mock。
const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve());

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (input: Record<string, unknown>) =>
    mockCreateAuditLogRecord(input),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type PaymentCommandsModule =
  typeof import("@/shared/domain/events/payment-commands");
type PrismaEnumsModule = typeof import("@generated/prisma/enums");
type HelpersModule =
  typeof import("@/shared/lib/validations/enums/refund-attribution");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let refundEventRegistrationPaymentCommand: PaymentCommandsModule["refundEventRegistrationPaymentCommand"];
let PaymentStatus: PrismaEnumsModule["PaymentStatus"];
let REFUNDED_BY_TYPE: HelpersModule["REFUNDED_BY_TYPE"];

type SharedEventFixture = {
  eventId: string;
  slotId: string;
  ticketId: string;
};

let sharedEvent: SharedEventFixture;
let testCategoryId: string;

/** SINGLE_OCCURRENCE Event + slot + ticket を 1 tx で作る (schedule integrity trigger 遵守)。 */
async function createSharedEvent(): Promise<SharedEventFixture> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `Refund Event ${suffix}`,
        slug: `refund-event-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        status: EventStatus.PUBLISHED,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        firstSlotStartAt: start,
        lastSlotEndAt: end,
        categoryId: testCategoryId,
      },
      select: { id: true },
    });

    const slot = await tx.eventTimeSlot.create({
      data: {
        eventId: event.id,
        startAt: start,
        endAt: end,
        capacity: 1000,
      },
      select: { id: true },
    });

    const ticket = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: "一般",
        price: 5000,
        capacity: null,
        isAvailable: true,
      },
      select: { id: true },
    });

    return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
  });
}

async function createPaidRegistration(paidAmount: number): Promise<{
  registrationId: string;
  cleanup: () => Promise<void>;
}> {
  const suffix = crypto.randomUUID();
  const registration = await prisma.eventRegistration.create({
    data: {
      eventId: sharedEvent.eventId,
      slotId: sharedEvent.slotId,
      ticketId: sharedEvent.ticketId,
      name: "山田太郎",
      email: `refund-event-${suffix}@example.com`,
      quantity: 1,
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: `pi_event_test_${suffix}`,
      paidAmount,
    },
    select: { id: true },
  });

  return {
    registrationId: registration.id,
    cleanup: async () => {
      await prisma.refund.deleteMany({
        where: { eventRegistrationId: registration.id },
      });
      await prisma.eventRegistration.deleteMany({
        where: { id: registration.id },
      });
    },
  };
}

describeMaybe("refundEventRegistrationPaymentCommand (integration)", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ refundEventRegistrationPaymentCommand } =
      await import("@/shared/domain/events/payment-commands"));
    ({ PaymentStatus } = await import("@generated/prisma/enums"));
    ({ REFUNDED_BY_TYPE } =
      await import("@/shared/lib/validations/enums/refund-attribution"));

    await prisma.$queryRaw`SELECT 1`;

    // 残留 fixture の予備削除 (再実行耐性)。FK: refund → registration → slot/ticket → event。
    await prisma.refund.deleteMany({
      where: {
        eventRegistration: {
          event: { slug: { startsWith: "refund-event-" } },
        },
      },
    });
    await prisma.eventRegistration.deleteMany({
      where: { event: { slug: { startsWith: "refund-event-" } } },
    });
    await prisma.event.deleteMany({
      where: { slug: { startsWith: "refund-event-" } },
    });

    const category = await prisma.eventCategory.create({
      data: {
        name: `Refund Test Category ${crypto.randomUUID()}`,
        // sortOrder はテーブル全体でユニーク制約があるため、並行実行する他の
        // integration test ファイルの EventCategory 行と衝突しない乱数域を使う。
        sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;

    sharedEvent = await createSharedEvent();
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: sharedEvent.eventId } });
    // EventCategory は onDelete: Restrict のため、紐づく Event の削除後に削除する。
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await basePrisma.$disconnect();
  });

  beforeEach(() => {
    mockRefundsCreate.mockReset();
    mockCreateAuditLogRecord.mockReset();
    mockRefundsCreate.mockImplementation((_args, _opts) =>
      Promise.resolve({
        id: `re_test_${crypto.randomUUID()}`,
        status: "succeeded",
      }),
    );
    mockCreateAuditLogRecord.mockImplementation(() => Promise.resolve());
  });

  test("UA-HORIZ-04: request 指定時は AuditLog metadata に ip/userAgent が載る", async () => {
    const { registrationId, cleanup } = await createPaidRegistration(5000);
    try {
      await refundEventRegistrationPaymentCommand({
        registrationId,
        actorType: REFUNDED_BY_TYPE.ADMIN,
        actorUserId: "admin-user-id",
        request: { ip: "203.0.113.42", userAgent: "test-admin-agent/1.0" },
      });

      expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
      const auditInput = mockCreateAuditLogRecord.mock.calls[0]![0] as {
        metadata: Record<string, unknown>;
      };
      expect(auditInput.metadata).toMatchObject({
        ip: "203.0.113.42",
        userAgent: "test-admin-agent/1.0",
      });
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("UA-HORIZ-04: request 未指定なら AuditLog metadata に ip/userAgent キーが付かない", async () => {
    const { registrationId, cleanup } = await createPaidRegistration(5000);
    try {
      await refundEventRegistrationPaymentCommand({
        registrationId,
        actorType: REFUNDED_BY_TYPE.STRIPE_DASHBOARD,
      });

      expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
      const auditInput = mockCreateAuditLogRecord.mock.calls[0]![0] as {
        metadata: Record<string, unknown>;
      };
      expect(auditInput.metadata).not.toHaveProperty("ip");
      expect(auditInput.metadata).not.toHaveProperty("userAgent");
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("UA-HORIZ-04: request.ip=null / userAgent=null は metadata に載せない", async () => {
    const { registrationId, cleanup } = await createPaidRegistration(5000);
    try {
      await refundEventRegistrationPaymentCommand({
        registrationId,
        actorType: REFUNDED_BY_TYPE.ADMIN,
        actorUserId: "admin-user-id",
        request: { ip: null, userAgent: null },
      });

      expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
      const auditInput = mockCreateAuditLogRecord.mock.calls[0]![0] as {
        metadata: Record<string, unknown>;
      };
      expect(auditInput.metadata).not.toHaveProperty("ip");
      expect(auditInput.metadata).not.toHaveProperty("userAgent");
    } finally {
      await cleanup();
    }
  }, 30_000);
});
