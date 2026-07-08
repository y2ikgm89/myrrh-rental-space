import { describe, test, expect, beforeAll, afterAll } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { basePrisma } = await import("@/shared/db/prisma");
const { claimReservationForCustomer } =
  await import("@/shared/domain/reservations/claim-commands");

async function createGuestReservationWithCustomer() {
  const guestCustomer = await prisma.customer.create({
    data: {
      email: "guest@example.com",
      emailCanonical: "guest@example.com",
      lastName: "ゲスト",
      firstName: "太郎",
      userId: null,
    },
  });
  const space = await prisma.space.findFirstOrThrow();
  const reservation = await prisma.reservation.create({
    data: {
      spaceId: space.id,
      customerId: guestCustomer.id,
      startTime: new Date("2026-05-01T01:00:00Z"),
      endTime: new Date("2026-05-01T02:00:00Z"),
      totalPrice: 1000,
      guestLastName: "ゲスト",
      guestFirstName: "太郎",
      guestEmail: "guest@example.com",
    },
  });
  return { guestCustomer, reservation };
}

async function createLinkedCustomer(userIdSuffix: string) {
  // crypto.randomUUID() を混ぜて email を一意化する。この統合テストは実行の都度
  // クリーンな DB を前提とせず、ローカルの永続 test-db コンテナに対して繰り返し
  // 実行される（他のテストファイルの同種ヘルパーと同じ堅牢化パターン、例:
  // space-overlap-concurrency.test.ts の `overlap-${crypto.randomUUID()}` 等）。
  const user = await prisma.user.create({
    data: {
      email: `member-${userIdSuffix}-${crypto.randomUUID()}@example.com`,
      name: "会員太郎",
      emailVerified: true,
    },
  });
  const customer = await prisma.customer.create({
    data: {
      email: user.email,
      emailCanonical: user.email,
      lastName: "会員",
      firstName: "太郎",
      userId: user.id,
    },
  });
  return customer;
}

describe("claimReservationForCustomer", () => {
  beforeAll(async () => {
    // 接続プールをウォームアップ（コールドスタートが並行クエリをずらして race を隠すのを防ぐ。
    // .claude/rules/testing-unit.md の規約、registration-overbooking.test.ts /
    // space-overlap-concurrency.test.ts と同型）。
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("未紐付けゲスト予約を会員Customerへ再紐付けする", async () => {
    const { reservation } = await createGuestReservationWithCustomer();
    const member = await createLinkedCustomer("a");

    const result = await claimReservationForCustomer(reservation.id, member.id);
    expect(result).toEqual({ claimed: true });

    const updated = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(updated.customerId).toBe(member.id);
  });

  test("同じ会員が再度claimしても idempotent に成功扱い", async () => {
    const { reservation } = await createGuestReservationWithCustomer();
    const member = await createLinkedCustomer("b");

    await claimReservationForCustomer(reservation.id, member.id);
    const second = await claimReservationForCustomer(reservation.id, member.id);
    expect(second).toEqual({ claimed: true });
  });

  test("既に別会員へclaim済みなら、後発のclaimは横取りできず失敗する", async () => {
    const { reservation } = await createGuestReservationWithCustomer();
    const firstMember = await createLinkedCustomer("c");
    const secondMember = await createLinkedCustomer("d");

    const first = await claimReservationForCustomer(
      reservation.id,
      firstMember.id,
    );
    expect(first).toEqual({ claimed: true });

    const second = await claimReservationForCustomer(
      reservation.id,
      secondMember.id,
    );
    expect(second).toEqual({ claimed: false });

    const updated = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(updated.customerId).toBe(firstMember.id);
  });

  test("存在しない予約IDは claimed: false", async () => {
    const member = await createLinkedCustomer("e");
    const result = await claimReservationForCustomer(
      "00000000-0000-4000-8000-000000000000",
      member.id,
    );
    expect(result).toEqual({ claimed: false });
  });

  test("同時に2つのclaimが競合しても先着1件のみ成立する(真の並行実行)", async () => {
    const { reservation } = await createGuestReservationWithCustomer();
    const memberA = await createLinkedCustomer("race-a");
    const memberB = await createLinkedCustomer("race-b");

    const [resultA, resultB] = await Promise.all([
      claimReservationForCustomer(reservation.id, memberA.id),
      claimReservationForCustomer(reservation.id, memberB.id),
    ]);

    const claimedResults = [resultA, resultB].filter((r) => r.claimed);
    expect(claimedResults.length).toBe(1);

    const updated = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect([memberA.id, memberB.id]).toContain(updated.customerId);
    // どちらが勝っても、DB に反映された customerId は勝者の result と一致する。
    const winnerId = resultA.claimed ? memberA.id : memberB.id;
    expect(updated.customerId).toBe(winnerId);
  });
});
