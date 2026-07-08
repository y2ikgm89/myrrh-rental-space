import { describe, test, expect, beforeAll, afterAll } from "bun:test";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { basePrisma } = await import("@/shared/db/prisma");
const { claimReservationForCustomer } =
  await import("@/shared/domain/reservations/claim-commands");

// CI の test-db はシードデータを持たない（マイグレーションのみ）ため、
// prisma.space.findFirstOrThrow() のような既存レコード依存は空振りする
// （ローカル永続コンテナでは他テストの残留行でたまたま通っていた）。
// space-overlap-concurrency.test.ts 等と同型の自己完結 fixture に揃える。
//
// sortOrder は Location に一意制約があるため、固定値からの単純インクリメントは
// このファイルを同一の永続 test-db コンテナに対して2回以上実行すると衝突する
// （CI は毎回クリーンな DB のため実害は無いが、ローカル反復実行の堅牢性のため
// slug/name 同様ランダム値にする）。
function randomSortOrder(): number {
  // Postgres integer (32bit有符号)の範囲内に収める（1,500,000,000 〜 1,999,999,999）。
  return Math.floor(Math.random() * 500_000_000) + 1_500_000_000;
}

async function createGuestReservationWithCustomer() {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `claim-loc-${suffix}`,
      name: `Claim Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: randomSortOrder(),
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `claim-space-${suffix}`,
      name: `Claim Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
    },
    select: { id: true },
  });

  const guestCustomer = await prisma.customer.create({
    data: {
      email: `guest-${suffix}@example.com`,
      emailCanonical: `guest-${suffix}@example.com`,
      lastName: "ゲスト",
      firstName: "太郎",
      userId: null,
    },
  });
  const reservation = await prisma.reservation.create({
    data: {
      spaceId: space.id,
      customerId: guestCustomer.id,
      startTime: new Date("2026-05-01T01:00:00Z"),
      endTime: new Date("2026-05-01T02:00:00Z"),
      totalPrice: 1000,
      guestLastName: "ゲスト",
      guestFirstName: "太郎",
      guestEmail: `guest-${suffix}@example.com`,
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
