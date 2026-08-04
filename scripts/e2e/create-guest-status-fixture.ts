import { asPrismaInputJsonValue } from "@/shared/db/prisma-input-json";
import { spaceFixtures } from "../../e2e/fixtures/test-data";
import { createScriptPrismaClient } from "../_shared/script-prisma";
import { resolveTestDatabaseUrl } from "../test-db-url";

process.env["DATABASE_URL"] = resolveTestDatabaseUrl(
  process.env["TEST_DATABASE_URL"],
).url;

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] &&
  process.env["BETTER_AUTH_SECRET"].length >= 32
    ? process.env["BETTER_AUTH_SECRET"]
    : "local-e2e-better-auth-secret-000000";

process.env["ENCRYPTION_KEY"] = process.env["ENCRYPTION_KEY"] || "0".repeat(64);

Bun.plugin({
  name: "stub-server-only",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
  },
});

const { createStatusToken, STATUS_TOKEN_LIFETIME_MS } =
  await import("@/shared/lib/reservation-status-token");

/** この fixture が専有するスペース。共有スペースだと EXCLUDE 制約で 2 回目が落ちる。 */
const SPACE_SLUG = spaceFixtures.guestReservationSpaceSlug;

/** 冪等化のための marker。前回分を purge してから作り直す。 */
const FIXTURE_MARKER = "[E2E] guest status fixture";

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    const space = await prisma.space.findFirstOrThrow({
      where: { slug: SPACE_SLUG },
      select: { id: true, name: true },
    });

    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const guestEmail = `e2e-status-guest-${unique}@example.com`;

    const guestCustomer = await prisma.customer.create({
      data: {
        email: guestEmail,
        emailCanonical: guestEmail,
        lastName: "ステータスE2Eゲスト",
        firstName: "太郎",
        userId: null,
      },
      select: { id: true },
    });

    // 固定枠。専有スペースなので他 fixture とは衝突しないが、**この fixture の
    // 前回分**とは衝突する（`reservations_no_active_time_overlap_excl` は
    // status ∈ {PENDING, CONFIRMED} を対象にする）。marker で先に片付けて冪等にする。
    const startTime = new Date("2027-06-10T01:00:00.000Z");
    const endTime = new Date("2027-06-10T03:00:00.000Z");

    const stale = await prisma.reservation.findMany({
      where: { spaceId: space.id, notes: { startsWith: FIXTURE_MARKER } },
      select: { id: true },
    });
    if (stale.length > 0) {
      const staleIds = stale.map((r) => r.id);
      await prisma.receipt.deleteMany({
        where: { reservationId: { in: staleIds } },
      });
      await prisma.reservation.deleteMany({ where: { id: { in: staleIds } } });
    }
    const totalPrice = 6000;
    const taxRate = 10;
    const taxAmount = Math.round((totalPrice * taxRate) / 100);

    const reservation = await prisma.reservation.create({
      data: {
        spaceId: space.id,
        customerId: guestCustomer.id,
        startTime,
        endTime,
        basePrice: totalPrice,
        totalPrice,
        taxRateType: "STANDARD",
        taxRate,
        taxAmount,
        totalPriceWithTax: totalPrice + taxAmount,
        rateBreakdownJson: asPrismaInputJsonValue(
          {
            schemaVersion: 1,
            segments: [],
            totalHours: 0,
            totalBasePrice: 0,
            holidayFlags: {},
          },
          "fixture rateBreakdownJson が不正です",
        ),
        guestLastName: "ステータスE2Eゲスト",
        guestFirstName: "太郎",
        guestEmail,
        status: "CONFIRMED",
        paymentStatus: "UNPAID",
        notes: `${FIXTURE_MARKER} ${unique}`,
      },
      select: { id: true },
    });

    const expiresAt = new Date(Date.now() + STATUS_TOKEN_LIFETIME_MS);
    const token = createStatusToken(reservation.id, expiresAt);

    console.log(
      JSON.stringify({
        reservationId: reservation.id,
        spaceName: space.name,
        token,
      }),
    );
  } finally {
    await disconnect();
  }
}

try {
  await main();
  // Playwright 側は `execFile` の解決を待つ。メール送信の detached promise や
  // pg pool のハンドルが残るとイベントループが空にならず、プロセスが終了せず
  // spec が丸ごとタイムアウトする（run 30595374008 の waitlist-offer-confirm は
  // 90 s 上限でもこれ）。stdout は書き終わっているので明示的に終了する。
  process.exit(0);
} catch (error) {
  console.error(
    "❌ create-guest-status-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
