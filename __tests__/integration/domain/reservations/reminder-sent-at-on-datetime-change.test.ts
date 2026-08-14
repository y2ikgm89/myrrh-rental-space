/**
 * F-124: 日時が実際に変わったときだけ reminderSentAt を戻す。
 *
 * リマインダ cron は reminderSentAt: null で対象を絞る。送信後に startTime を
 * 動かしてもラッチが残ると、新しい利用日の前日リマインダが二度と送られない。
 * startTime が同じ保存ではクリアしない（送信失敗リトライの意味と混線させない）。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { ReservationStatus, TaxRateType } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

mock.module("next/cache", () => ({
  cacheLife: () => undefined,
  cacheTag: () => undefined,
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type CustomerCommandsModule =
  typeof import("@/shared/domain/reservations/customer-commands");
type AdminCommandsModule =
  typeof import("@/shared/domain/reservations/admin-commands");
type InboundMutationsModule =
  typeof import("@/shared/domain/reservations/calendar-sync-inbound-mutations");

let prisma: PrismaModule["prisma"];
let updateCustomerReservation: CustomerCommandsModule["updateCustomerReservation"];
let updateAdminReservationCommand: AdminCommandsModule["updateAdminReservationCommand"];
let applyCalendarTimeChange: InboundMutationsModule["applyCalendarTimeChange"];

const ORIGINAL_DATE = "2027-03-19";
const MOVED_DATE = "2027-03-26";
const MODIFICATION_DEADLINE_HOURS = 48;
const ADMIN_USER_ID = "00000000-0000-4000-9000-000000000124";
const SENT_AT = new Date("2027-03-18T00:00:00+09:00");

const DEFAULT_PRICING = {
  basePrice: 2000,
  totalPrice: 2000,
  rateBreakdownJson: {
    schemaVersion: 1,
    segments: [],
    totalHours: 2,
    totalBasePrice: 2000,
    holidayFlags: {},
  },
  taxRateType: TaxRateType.STANDARD,
  taxRate: 10,
  taxAmount: 200,
  totalPriceWithTax: 2200,
};

let nextFixtureLocationSortOrder = 1_624_000_000;

type Fixture = {
  reservationId: string;
  customerId: string;
  spaceId: string;
  cleanup: () => Promise<void>;
};

async function createReservationFixture(): Promise<Fixture> {
  const suffix = crypto.randomUUID();
  const startTime = new Date(`${ORIGINAL_DATE}T10:00:00+09:00`);
  const endTime = new Date(`${ORIGINAL_DATE}T12:00:00+09:00`);

  const location = await prisma.location.create({
    data: {
      slug: `f124-loc-${suffix}`,
      name: `F124 Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureLocationSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `f124-space-${suffix}`,
      name: `F124 Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      isPublished: true,
      isActive: true,
    },
    select: { id: true },
  });

  const customer = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `f124-${suffix}@example.com`,
      emailCanonical: `f124-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const reservation = await prisma.reservation.create({
    data: {
      spaceId: space.id,
      customerId: customer.id,
      startTime,
      endTime,
      status: ReservationStatus.CONFIRMED,
      numberOfGuests: 1,
      reminderSentAt: SENT_AT,
      ...DEFAULT_PRICING,
    },
    select: { id: true },
  });

  return {
    reservationId: reservation.id,
    customerId: customer.id,
    spaceId: space.id,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

async function reminderSentAtOf(reservationId: string): Promise<Date | null> {
  const row = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: { reminderSentAt: true },
  });
  return row.reminderSentAt;
}

async function ensureKnownSettings(): Promise<void> {
  const commerceData = {
    taxStandardRate: 10,
    taxReducedRate: 8,
    taxDisplayModePublic: "TAX_INCLUDED" as const,
    durationDiscountEnabled: false,
    durationDiscountRules: [],
    discountCombinationMode: "BEST" as const,
    showOriginalPrice: true,
  };
  const reservationData = {
    defaultTimeSlot: 60,
    minReservationDuration: 60,
    maxReservationDuration: 480,
  };
  await Promise.all([
    prisma.settingsCommerce.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...commerceData },
      update: commerceData,
    }),
    prisma.settingsReservation.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...reservationData },
      update: reservationData,
    }),
    prisma.user.upsert({
      where: { id: ADMIN_USER_ID },
      create: {
        id: ADMIN_USER_ID,
        name: "F124 Admin",
        email: `admin-f124-${ADMIN_USER_ID}@example.test`,
        emailVerified: false,
        role: "ADMIN",
      },
      update: {},
    }),
  ]);
}

describeMaybe("reminderSentAt after datetime change (F-124)", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ updateCustomerReservation } =
      await import("@/shared/domain/reservations/customer-commands"));
    ({ updateAdminReservationCommand } =
      await import("@/shared/domain/reservations/admin-commands"));
    ({ applyCalendarTimeChange } =
      await import("@/shared/domain/reservations/calendar-sync-inbound-mutations"));
    await prisma.$queryRaw`SELECT 1`;
    await ensureKnownSettings();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("顧客セルフ変更で startTime が変わると reminderSentAt をクリアする", async () => {
    const { reservationId, customerId, spaceId, cleanup } =
      await createReservationFixture();
    try {
      const result = await updateCustomerReservation(
        reservationId,
        customerId,
        {
          spaceId,
          date: MOVED_DATE,
          startTime: "10:00",
          endTime: "12:00",
          numberOfGuests: 1,
          version: 0,
        },
        MODIFICATION_DEADLINE_HOURS,
      );
      expect(result.success).toBe(true);
      expect(await reminderSentAtOf(reservationId)).toBeNull();
    } finally {
      await cleanup();
    }
  });

  test("admin 編集で startTime が変わると reminderSentAt をクリアする", async () => {
    const { reservationId, customerId, spaceId, cleanup } =
      await createReservationFixture();
    try {
      await updateAdminReservationCommand(reservationId, {
        spaceId,
        date: MOVED_DATE,
        startTime: "10:00",
        endTime: "12:00",
        customerId,
        status: ReservationStatus.CONFIRMED,
        adminUserId: ADMIN_USER_ID,
        numberOfGuests: 1,
        version: 0,
      });
      expect(await reminderSentAtOf(reservationId)).toBeNull();
    } finally {
      await cleanup();
    }
  });

  test("GCal inbound で startTime が変わると reminderSentAt をクリアする", async () => {
    const { reservationId, spaceId, cleanup } =
      await createReservationFixture();
    try {
      const result = await applyCalendarTimeChange({
        reservationId,
        spaceId,
        existingNotes: null,
        startTime: new Date(`${MOVED_DATE}T10:00:00+09:00`),
        endTime: new Date(`${MOVED_DATE}T12:00:00+09:00`),
      });
      expect(result).toEqual({ success: true });
      expect(await reminderSentAtOf(reservationId)).toBeNull();
    } finally {
      await cleanup();
    }
  });

  test("admin 編集で startTime が同じなら reminderSentAt を残す", async () => {
    const { reservationId, customerId, spaceId, cleanup } =
      await createReservationFixture();
    try {
      await updateAdminReservationCommand(reservationId, {
        spaceId,
        date: ORIGINAL_DATE,
        startTime: "10:00",
        endTime: "12:00",
        customerId,
        status: ReservationStatus.CONFIRMED,
        notes: "メモのみ",
        adminUserId: ADMIN_USER_ID,
        numberOfGuests: 1,
        version: 0,
      });
      expect(await reminderSentAtOf(reservationId)).toEqual(SENT_AT);
    } finally {
      await cleanup();
    }
  });
});
