import { describe, test, expect, beforeAll, afterAll } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma, basePrisma } = await import("@/shared/db/prisma");
const { claimEventRegistrationForCustomer } =
  await import("@/shared/domain/events/claim-commands");
const { RegistrationStatus, EventStatus, EventScheduleMode } =
  await import("@/shared/lib/validations/enums/prisma-types");

/**
 * PUBLISHED イベント + タイムスロット + 受付中チケットを 1 件作る
 * （`registration-overbooking.test.ts` の `createTestEvent` と同型のパターン。
 * `events_schedule_integrity_check` トリガーが scheduleMode と slot 件数の
 * 整合を強制するため SINGLE_OCCURRENCE + slot 1 件を同一トランザクションで作る）。
 */
async function createTestEvent(): Promise<{
  eventId: string;
  ticketId: string;
  slotId: string;
}> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: "Claim Command Test",
        slug: `claim-command-test-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        status: EventStatus.PUBLISHED,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        firstSlotStartAt: start,
        lastSlotEndAt: end,
      },
      select: { id: true },
    });

    const slot = await tx.eventTimeSlot.create({
      data: {
        eventId: event.id,
        startAt: start,
        endAt: end,
        capacity: 100,
      },
      select: { id: true },
    });

    const ticket = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: "一般",
        price: 0,
        capacity: null,
        isAvailable: true,
      },
      select: { id: true },
    });

    return { eventId: event.id, ticketId: ticket.id, slotId: slot.id };
  });
}

async function createGuestEventRegistration() {
  const { eventId, ticketId, slotId } = await createTestEvent();
  return prisma.eventRegistration.create({
    data: {
      eventId,
      slotId,
      ticketId,
      name: "ゲスト太郎",
      email: `event-guest-${crypto.randomUUID()}@example.com`,
      quantity: 1,
      status: RegistrationStatus.CONFIRMED,
      customerId: null,
    },
  });
}

async function createLinkedCustomer(userIdSuffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `event-member-${userIdSuffix}-${crypto.randomUUID()}@example.com`,
      name: "会員太郎",
      emailVerified: true,
    },
  });
  return prisma.customer.create({
    data: {
      email: user.email,
      emailCanonical: user.email,
      lastName: "会員",
      firstName: "太郎",
      userId: user.id,
    },
  });
}

describe("claimEventRegistrationForCustomer", () => {
  beforeAll(async () => {
    // 接続プールをウォームアップ（コールドスタートが並行クエリをずらして race を
    // 隠すのを防ぐ。registration-overbooking.test.ts / claimReservationForCustomer
    // の統合テストと同型）。
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("customerId: null のゲスト申込を会員Customerへ紐付ける", async () => {
    const registration = await createGuestEventRegistration();
    const member = await createLinkedCustomer("a");

    const result = await claimEventRegistrationForCustomer(
      registration.id,
      member.id,
    );
    expect(result).toEqual({ claimed: true });

    const updated = await prisma.eventRegistration.findUniqueOrThrow({
      where: { id: registration.id },
    });
    expect(updated.customerId).toBe(member.id);
  });

  test("同じ会員が再度claimしても idempotent に成功扱い", async () => {
    const registration = await createGuestEventRegistration();
    const memberA = await createLinkedCustomer("self-reclaim");

    const first = await claimEventRegistrationForCustomer(
      registration.id,
      memberA.id,
    );
    expect(first).toEqual({ claimed: true });

    const second = await claimEventRegistrationForCustomer(
      registration.id,
      memberA.id,
    );
    expect(second).toEqual({ claimed: true });

    const updated = await prisma.eventRegistration.findUniqueOrThrow({
      where: { id: registration.id },
    });
    expect(updated.customerId).toBe(memberA.id);
  });

  test("既に customerId が設定済みなら以降のclaimは全て失敗する", async () => {
    const registration = await createGuestEventRegistration();
    const firstMember = await createLinkedCustomer("b");
    const secondMember = await createLinkedCustomer("c");

    await claimEventRegistrationForCustomer(registration.id, firstMember.id);
    const second = await claimEventRegistrationForCustomer(
      registration.id,
      secondMember.id,
    );
    expect(second).toEqual({ claimed: false });

    const updated = await prisma.eventRegistration.findUniqueOrThrow({
      where: { id: registration.id },
    });
    expect(updated.customerId).toBe(firstMember.id);
  });

  test("存在しない申込IDは claimed: false", async () => {
    const member = await createLinkedCustomer("d");
    const result = await claimEventRegistrationForCustomer(
      "00000000-0000-4000-8000-000000000000",
      member.id,
    );
    expect(result).toEqual({ claimed: false });
  });

  test("同時に2つのclaimが競合しても先着1件のみ成立する(真の並行実行)", async () => {
    const registration = await createGuestEventRegistration();
    const memberA = await createLinkedCustomer("race-a");
    const memberB = await createLinkedCustomer("race-b");

    const [resultA, resultB] = await Promise.all([
      claimEventRegistrationForCustomer(registration.id, memberA.id),
      claimEventRegistrationForCustomer(registration.id, memberB.id),
    ]);

    const claimedResults = [resultA, resultB].filter((r) => r.claimed);
    expect(claimedResults.length).toBe(1);

    const updated = await prisma.eventRegistration.findUniqueOrThrow({
      where: { id: registration.id },
    });
    // どちらが勝っても、DB に反映された customerId は勝者（memberA/memberB のいずれか）の
    // result と一致する（return 値を信用せず DB を再読取して確認する）。
    const winnerId = resultA.claimed ? memberA.id : memberB.id;
    expect(updated.customerId).toBe(winnerId);
  });
});
