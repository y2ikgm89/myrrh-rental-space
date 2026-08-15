/**
 * getReservationForGuestStatus: 薄いステータスページ用の最小 select。
 *
 * == 実行条件 ==
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
 * `TEST_DATABASE_URL` 未設定時は describe.skip で silent skip。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CustomerQueriesModule =
  typeof import("@/shared/domain/reservations/customer-queries");

let getReservationForGuestStatus: CustomerQueriesModule["getReservationForGuestStatus"];

let prisma: PrismaModule["prisma"];

describeMaybe("getReservationForGuestStatus", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ getReservationForGuestStatus } =
      await import("@/shared/domain/reservations/customer-queries"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("space / 日時 / 金額 / paymentStatus / receipt serial / customer.userId を返す", async () => {
    const { PaymentStatus, TaxRateType } =
      await import("@generated/prisma/enums");

    const testId = randomUUID();

    const location = await prisma.location.create({
      data: {
        slug: `guest-status-loc-${testId}`,
        name: `Guest Status Location ${testId}`,
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/loc.jpg",
        sortOrder: 999_000_000 + Math.floor(Math.random() * 1000),
      },
    });

    const space = await prisma.space.create({
      data: {
        slug: `guest-status-space-${testId}`,
        name: `Guest Status Space ${testId}`,
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
        email: `guest-status-${testId}@example.com`,
        emailCanonical: `guest-status-${testId}@example.com`,
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
        paymentStatus: PaymentStatus.PAID,
      },
    });

    const receipt = await prisma.receipt.create({
      data: {
        serialNo: `2026-${testId.slice(0, 6).toUpperCase()}`,
        reservationId: reservation.id,
        recipientName: "山田 太郎",
        subject: "スペース利用料",
        amount: 1100,
        taxAmount: 100,
        taxRate: 10,
        issuerSnapshot: { name: "Test Issuer" },
      },
    });

    const result = await getReservationForGuestStatus(reservation.id);

    expect(result?.space.name).toBe(space.name);
    expect(result?.space.location?.address).toBe("東京都テスト区1-2-3");
    expect(result?.startTime.toISOString()).toBe(
      reservation.startTime.toISOString(),
    );
    expect(result?.endTime.toISOString()).toBe(
      reservation.endTime.toISOString(),
    );
    expect(result?.totalPrice).toBe(1000);
    expect(result?.totalPriceWithTax).toBe(1100);
    expect(result?.paymentStatus).toBe(PaymentStatus.PAID);
    expect(result?.receipt?.serialNo).toBe(receipt.serialNo);
    expect(result?.customer.userId).toBeNull();

    await prisma.receipt.delete({ where: { id: receipt.id } });
    await prisma.reservation.delete({ where: { id: reservation.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.space.delete({ where: { id: space.id } });
    await prisma.location.delete({ where: { id: location.id } });
  });

  test("存在しない予約は null", async () => {
    expect(await getReservationForGuestStatus(randomUUID())).toBeNull();
  });
});
