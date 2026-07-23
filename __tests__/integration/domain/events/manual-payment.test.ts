/**
 * recordManualEventPaymentCommand の UNPAID → PAID 遷移を実DBで検証する。
 * claimEventRegistrationAsPaid と同じ updateMany WHERE claim パターンで実装する。
 *
 * レビュー Important #2: 成功パスのみ 1 件だった VALIDATION / CONFLICT カバレッジを追加。
 * CANCELLED ケースはレビュー Important #1（status: CONFIRMED ガード追加）に伴う新規ケース。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { EventScheduleMode, EventStatus } from "@generated/prisma/enums";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す
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

type PrismaModule = typeof import("@/shared/db/prisma");
type PaymentCommandsModule =
  typeof import("@/shared/domain/events/payment-commands");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let recordManualEventPaymentCommand: PaymentCommandsModule["recordManualEventPaymentCommand"];
let testCategoryId: string;

async function createFixtureEvent(): Promise<{
  eventId: string;
  slotId: string;
  ticketId: string;
}> {
  const suffix = crypto.randomUUID();
  const start = new Date("2026-08-01T10:00:00.000Z");
  const end = new Date("2026-08-01T12:00:00.000Z");

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `手動入金テスト ${suffix}`,
        slug: `manual-payment-${suffix}`,
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
      data: { eventId: event.id, startAt: start, endAt: end, capacity: 10 },
      select: { id: true },
    });

    const ticket = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: "有料",
        price: 1000,
        isAvailable: true,
      },
      select: { id: true },
    });

    return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
  });
}

async function createFixtureRegistration(
  fixture: { eventId: string; slotId: string; ticketId: string },
  overrides: {
    status?: "CONFIRMED" | "CANCELLED";
    paymentStatus?: "UNPAID" | "PAID";
    stripeCheckoutSessionId?: string | null;
  } = {},
): Promise<string> {
  const registration = await prisma.eventRegistration.create({
    data: {
      eventId: fixture.eventId,
      slotId: fixture.slotId,
      ticketId: fixture.ticketId,
      name: "手動入金太郎",
      quantity: 1,
      status: (overrides.status ?? "CONFIRMED") as never,
      paymentStatus: (overrides.paymentStatus ?? "UNPAID") as never,
      stripeCheckoutSessionId: overrides.stripeCheckoutSessionId ?? null,
    },
    select: { id: true },
  });
  return registration.id;
}

async function cleanupFixture(eventId: string): Promise<void> {
  // registration → ticket → event の順で削除 (slot は event.delete() の cascade に任せる)。
  await prisma.eventRegistration.deleteMany({ where: { eventId } });
  await prisma.eventTicket.deleteMany({ where: { eventId } });
  await prisma.event.delete({ where: { id: eventId } });
}

describeMaybe("recordManualEventPaymentCommand", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ recordManualEventPaymentCommand } =
      await import("@/shared/domain/events/payment-commands"));

    const category = await prisma.eventCategory.create({
      data: {
        name: `Manual Payment Test Category ${crypto.randomUUID()}`,
        // sortOrder はテーブル全体でユニーク制約があるため、並行実行する他の
        // integration test ファイルの EventCategory 行と衝突しない乱数域を使う。
        sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
  });

  afterAll(async () => {
    // EventCategory は onDelete: Restrict のため、紐づく Event がすべて
    // 各テストの finally で削除された後に削除する。
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await basePrisma.$disconnect();
  });

  test("UNPAID の登録を PAID にし、金額を記録する", async () => {
    const fixture = await createFixtureEvent();
    const registrationId = await createFixtureRegistration(fixture);

    try {
      const result = await recordManualEventPaymentCommand({
        registrationId,
        amount: 1000,
      });
      expect(result.registrationId).toBe(registrationId);

      const updated = await prisma.eventRegistration.findUniqueOrThrow({
        where: { id: registrationId },
      });
      expect(updated.paymentStatus).toBe("PAID");
      expect(updated.paidAmount).toBe(1000);
      expect(updated.paidAt).not.toBeNull();
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  }, 30_000);

  test("Stripe決済進行中 (stripeCheckoutSessionId 非null) の登録は VALIDATION で拒否される", async () => {
    const fixture = await createFixtureEvent();
    const registrationId = await createFixtureRegistration(fixture, {
      stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
    });

    try {
      let caught: unknown = null;
      try {
        await recordManualEventPaymentCommand({
          registrationId,
          amount: 1000,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: "VALIDATION" });
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  }, 30_000);

  test("既にPAIDの登録は CONFLICT で拒否される", async () => {
    const fixture = await createFixtureEvent();
    const registrationId = await createFixtureRegistration(fixture, {
      paymentStatus: "PAID",
    });

    try {
      let caught: unknown = null;
      try {
        await recordManualEventPaymentCommand({
          registrationId,
          amount: 1000,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: "CONFLICT" });
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  }, 30_000);

  test("CANCELLED な登録は (UNPAIDのままでも) CONFLICT で拒否される", async () => {
    const fixture = await createFixtureEvent();
    const registrationId = await createFixtureRegistration(fixture, {
      status: "CANCELLED",
    });

    try {
      let caught: unknown = null;
      try {
        await recordManualEventPaymentCommand({
          registrationId,
          amount: 1000,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: "CONFLICT" });

      // 会計整合性の直接確認: PAID に焼き付いていないこと
      const untouched = await prisma.eventRegistration.findUniqueOrThrow({
        where: { id: registrationId },
      });
      expect(untouched.paymentStatus).toBe("UNPAID");
      expect(untouched.paidAmount).toBeNull();
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  }, 30_000);
});
