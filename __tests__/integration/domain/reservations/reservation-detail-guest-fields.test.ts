/**
 * getReservationByIdQuery が guestEmail / guestCustomerType を select し忘れている
 * 既知のギャップ（Phase 3 事前調査で発見）を修正する回帰テスト。
 */
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma } = await import("@/shared/db/prisma");
const { getReservationByIdQuery } =
  await import("@/shared/domain/reservations/admin-queries");
const { CustomerType, TaxRateType } = await import("@generated/prisma/enums");

describe("getReservationByIdQuery: guest field parity", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("guestEmail / guestCustomerType を含めて返す", async () => {
    const testId = randomUUID();

    // Create location first (required by Space)
    const location = await prisma.location.create({
      data: {
        slug: `guest-fields-loc-${testId}`,
        name: `Guest Fields Location ${testId}`,
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/loc.jpg",
        sortOrder: 999_000_000 + Math.floor(Math.random() * 1000),
      },
    });

    // Create space with all required fields
    const space = await prisma.space.create({
      data: {
        slug: `guest-fields-space-${testId}`,
        name: `Guest Fields Space ${testId}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        capacity: 10,
        hourlyPrice: 1000,
        mainImageUrl: "https://example.com/space.jpg",
        locationId: location.id,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        lastName: "山田",
        firstName: "太郎",
        email: `guest-field-${testId}@example.com`,
        emailCanonical: `guest-field-${testId}@example.com`,
      },
    });

    const reservation = await prisma.reservation.create({
      data: {
        spaceId: space.id,
        customerId: customer.id,
        startTime: new Date("2026-08-01T01:00:00.000Z"),
        endTime: new Date("2026-08-01T02:00:00.000Z"),
        totalPrice: 1000,
        basePrice: 1000,
        rateBreakdownJson: {
          schemaVersion: 1,
          segments: [],
          totalHours: 0,
          totalBasePrice: 0,
          holidayFlags: {},
        },
        taxRateType: TaxRateType.STANDARD,
        taxRate: 10,
        taxAmount: 100,
        totalPriceWithTax: 1100,
        guestLastName: "予約者",
        guestFirstName: "ゲスト",
        guestEmail: "guest-at-booking@example.com",
        guestCustomerType: CustomerType.CORPORATE,
      },
    });

    const result = await getReservationByIdQuery(reservation.id);

    expect(result?.guestEmail).toBe("guest-at-booking@example.com");
    expect(result?.guestCustomerType).toBe(CustomerType.CORPORATE);

    await prisma.reservation.delete({ where: { id: reservation.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.space.delete({ where: { id: space.id } });
    await prisma.location.delete({ where: { id: location.id } });
  });
});
