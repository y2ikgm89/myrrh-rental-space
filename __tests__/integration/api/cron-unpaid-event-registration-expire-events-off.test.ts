/**
 * hole D の閉じ印: events OFF 中に入金が確定した申込を、ON 復帰後の
 * expire cron が CANCELLED にしない。
 *
 * feature OFF は新規受付を止めるだけ。既に動いたお金は記録する。
 * expire cron は OFF 中は動かない（この skip は変えない）。webhook は
 * feature を見ないので `async_payment_succeeded` が PAID を書く。
 * ON に戻したあと cron が通常どおり走るが、その行は候補に入らない。
 *
 * (b) の webhook を外すと、stale UNPAID のまま ON 復帰後の cron に
 * 拾われて CANCELLED になり、このテストは落ちる。
 *
 * == 実行条件 ==
 * 実 Postgres。`bun run test:integration` が test-db を用意する。
 * `TEST_DATABASE_URL` 未設定なら describe ごと skip する。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  EventScheduleMode,
  EventStatus,
  PaymentStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";
import { installEmailLibDispatchMock } from "../../support/email-lib-dispatch-mock";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

const TICKET_PRICE = 3000;
const STALE_CREATED_AT = new Date(Date.now() - 2 * 60 * 60 * 1000);

let eventsEnabled = false;

mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: () => Promise.resolve(null),
}));

mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: (module: string) =>
    Promise.resolve(module === "events" ? eventsEnabled : true),
}));

const mockInvalidateSiteWideCacheFromRouteHandler = mock<
  (tags: readonly string[]) => void
>(() => undefined);
mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCacheFromRouteHandler:
    mockInvalidateSiteWideCacheFromRouteHandler,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => {
    throw error;
  },
}));

const realErrorsServer = await import("@/shared/lib/errors/server");
const mockLogError = mock<() => void>(() => undefined);
mock.module("@/shared/lib/errors/server", () => ({
  ...realErrorsServer,
  logError: (...args: Parameters<typeof mockLogError>) => mockLogError(...args),
}));

installEmailLibDispatchMock();

const mockConnection = mock(() => Promise.resolve());
mock.module("next/server", () => ({
  connection: mockConnection,
  NextResponse,
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type ExpireRouteModule =
  typeof import("@/app/api/cron/unpaid-event-registration-expire/route");
type AsyncPaymentSucceededModule =
  typeof import("@/shared/domain/payment/stripe-webhook/checkout-session-async-payment-succeeded");

let prisma: PrismaModule["prisma"];
let GET: ExpireRouteModule["GET"];
let handleAsyncPaymentSucceeded: AsyncPaymentSucceededModule["handleAsyncPaymentSucceeded"];
let testCategoryId: string;

function makeCronRequest(): Request {
  return new Request(
    "http://localhost/api/cron/unpaid-event-registration-expire",
    { headers: { Authorization: "Bearer test-oidc-token" } },
  );
}

function paidEventRegistrationSession(
  registrationId: string,
): Stripe.Checkout.Session {
  return {
    id: `cs_test_${crypto.randomUUID()}`,
    object: "checkout.session",
    metadata: {
      type: "event-registration",
      registrationId,
    },
    payment_intent: `pi_test_${crypto.randomUUID()}`,
    payment_status: "paid",
    amount_total: TICKET_PRICE,
    currency: "jpy",
  } as Stripe.Checkout.Session;
}

const unusedStripeClient = {} as AsyncOnlyStripe;

async function createStaleUnpaidRegistration(): Promise<{
  eventId: string;
  registrationId: string;
}> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const { eventId, registrationId } = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `events-off expire ${suffix}`,
        slug: `events-off-expire-${suffix}`,
        status: EventStatus.PUBLISHED,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
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
        capacity: 10,
      },
      select: { id: true },
    });
    const ticket = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: "有料",
        price: TICKET_PRICE,
        isAvailable: true,
      },
      select: { id: true },
    });
    const registration = await tx.eventRegistration.create({
      data: {
        eventId: event.id,
        slotId: slot.id,
        ticketId: ticket.id,
        name: "山田太郎",
        email: `events-off-expire-${suffix}@example.com`,
        quantity: 1,
        status: RegistrationStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
        stripeCheckoutSessionId: null,
      },
      select: { id: true },
    });
    return { eventId: event.id, registrationId: registration.id };
  });

  await prisma.$executeRaw`UPDATE "event_registrations" SET "created_at" = ${STALE_CREATED_AT} WHERE "id" = ${registrationId}::uuid`;

  return { eventId, registrationId };
}

async function cleanupEvent(eventId: string): Promise<void> {
  const registrations = await prisma.eventRegistration.findMany({
    where: { eventId },
    select: { id: true },
  });
  const registrationIds = registrations.map((row) => row.id);
  if (registrationIds.length > 0) {
    await prisma.receipt.deleteMany({
      where: { eventRegistrationId: { in: registrationIds } },
    });
  }
  await prisma.eventRegistration.deleteMany({ where: { eventId } });
  await prisma.$transaction(async (tx) => {
    await tx.eventTicket.deleteMany({ where: { eventId } });
    await tx.eventTimeSlot.deleteMany({ where: { eventId } });
    await tx.event.deleteMany({ where: { id: eventId } });
  });
}

describeMaybe(
  "events OFF 中に PAID になった申込は ON 復帰後も expire されない",
  () => {
    beforeAll(async () => {
      ({ prisma } = await import("@/shared/db/prisma"));
      ({ GET } =
        await import("@/app/api/cron/unpaid-event-registration-expire/route"));
      ({ handleAsyncPaymentSucceeded } =
        await import("@/shared/domain/payment/stripe-webhook/checkout-session-async-payment-succeeded"));
      await prisma.$queryRaw`SELECT 1`;

      const category = await prisma.eventCategory.create({
        data: {
          name: `events-off expire ${crypto.randomUUID()}`,
          sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
        },
        select: { id: true },
      });
      testCategoryId = category.id;
    });

    afterAll(async () => {
      await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
      await prisma.$disconnect();
    });

    test("OFF 中は expire を skip し、async_payment_succeeded の PAID を ON 復帰後も残す", async () => {
      const { eventId, registrationId } = await createStaleUnpaidRegistration();

      try {
        eventsEnabled = false;
        const skipped = await GET(makeCronRequest());
        expect(skipped.status).toBe(200);
        expect(await skipped.json()).toMatchObject({
          skipped: true,
          reason: "feature_disabled",
        });

        const stillUnpaid = await prisma.eventRegistration.findUniqueOrThrow({
          where: { id: registrationId },
          select: { status: true, paymentStatus: true },
        });
        expect(stillUnpaid.status).toBe(RegistrationStatus.CONFIRMED);
        expect(stillUnpaid.paymentStatus).toBe(PaymentStatus.UNPAID);

        await handleAsyncPaymentSucceeded(
          paidEventRegistrationSession(registrationId),
          unusedStripeClient,
        );

        const paid = await prisma.eventRegistration.findUniqueOrThrow({
          where: { id: registrationId },
          select: { status: true, paymentStatus: true },
        });
        expect(paid.status).toBe(RegistrationStatus.CONFIRMED);
        expect(paid.paymentStatus).toBe(PaymentStatus.PAID);

        eventsEnabled = true;
        const recovered = await GET(makeCronRequest());
        expect(recovered.status).toBe(200);
        const body = (await recovered.json()) as {
          expired?: number;
          details?: { registrationId: string }[];
        };
        expect(body.expired ?? 0).toBe(0);
        expect(
          body.details?.some(
            (entry) => entry.registrationId === registrationId,
          ),
        ).toBeFalsy();

        const afterOn = await prisma.eventRegistration.findUniqueOrThrow({
          where: { id: registrationId },
          select: { status: true, paymentStatus: true },
        });
        expect(afterOn.status).toBe(RegistrationStatus.CONFIRMED);
        expect(afterOn.paymentStatus).toBe(PaymentStatus.PAID);
      } finally {
        await cleanupEvent(eventId);
      }
    }, 30_000);
  },
);
