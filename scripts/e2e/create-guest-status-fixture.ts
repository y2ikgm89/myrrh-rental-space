import { asPrismaInputJsonValue } from "@/shared/db/prisma-input-json";
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

const SPACE_SLUG = "coworking-space";

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

    const startTime = new Date("2027-06-10T01:00:00.000Z");
    const endTime = new Date("2027-06-10T03:00:00.000Z");
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
        taxRateType: "standard",
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
} catch (error) {
  console.error(
    "❌ create-guest-status-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
