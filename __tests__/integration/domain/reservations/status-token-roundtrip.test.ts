/**
 * `createStatusToken → verifyStatusToken → resolveGuestStatusAccess →
 * getReservationForGuestStatus` および passcode reveal 認可チェーンの
 * 実 Postgres round-trip 統合テスト。
 *
 * **このテストが守る不変条件**:
 *   1. ステータストークンの wire format が server 起動 〜 DB lookup まで
 *      壊れずに往復する（payload の `rid` で実 reservation 行を解決できる）。
 *   2. status hub と passcode reveal が共有する member-ownership 判定が
 *      実 customer 行に対して正しく mismatch / ok を返す。
 *   3. status-token auth 経由の passcode reveal が実 SmartLockPasscode 行を
 *      decrypt して返す（switchbot 有効 + CONFIRMED + 表示窓内）。
 *
 * == 実行条件 ==
 * `cancel-by-token-roundtrip.test.ts` と同じ規約。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
  ReservationStatus,
  SmartLockDeviceType,
  SmartLockPasscodeStatus,
  TaxRateType,
} from "@generated/prisma/enums";
import { checkGuestStatusMemberOwnership } from "@/shared/lib/guest-status-member-ownership";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CustomerQueriesModule =
  typeof import("@/shared/domain/reservations/customer-queries");
type GuestStatusViewModule =
  typeof import("@/shared/domain/reservations/guest-status-view");
type PasscodeQueriesModule =
  typeof import("@/shared/domain/smart-lock/customer-passcode-queries");
type StatusTokenModule = typeof import("@/shared/lib/reservation-status-token");
type EventStatusTokenModule =
  typeof import("@/shared/lib/event-registration-status-token");
type EventGuestStatusViewModule =
  typeof import("@/shared/domain/events/guest-status-view");
type EventRegistrationQueriesModule =
  typeof import("@/shared/domain/events/registration-queries");

let prisma: PrismaModule["prisma"];
let getReservationForGuestStatus: CustomerQueriesModule["getReservationForGuestStatus"];
let getReservationCustomerId: CustomerQueriesModule["getReservationCustomerId"];
let resolveGuestStatusAccess: GuestStatusViewModule["resolveGuestStatusAccess"];
let getCustomerVisibleSmartLockPasscodesForReservation: PasscodeQueriesModule["getCustomerVisibleSmartLockPasscodesForReservation"];
let createStatusToken: StatusTokenModule["createStatusToken"];
let verifyStatusToken: StatusTokenModule["verifyStatusToken"];
let STATUS_TOKEN_LIFETIME_MS: StatusTokenModule["STATUS_TOKEN_LIFETIME_MS"];
let createEventRegistrationStatusToken: EventStatusTokenModule["createEventRegistrationStatusToken"];
let verifyEventRegistrationStatusToken: EventStatusTokenModule["verifyEventRegistrationStatusToken"];
let resolveGuestEventRegistrationStatusAccess: EventGuestStatusViewModule["resolveGuestEventRegistrationStatusAccess"];
let getEventRegistrationForGuestStatus: EventRegistrationQueriesModule["getEventRegistrationForGuestStatus"];
let encryptPasscode: (typeof import("@/shared/lib/crypto"))["encrypt"];
let passcodeCryptoPurpose: (typeof import("@/shared/domain/smart-lock/issue-passcode"))["PASSCODE_CRYPTO_PURPOSE"];

type ReservationFixture = {
  reservationId: string;
  customerId: string;
  startTime: Date;
  endTime: Date;
  cleanup: () => Promise<void>;
};

type PasscodeReservationFixture = ReservationFixture & {
  deviceId: string;
  passcodePlaintext: string;
};

type EventRegistrationFixture = {
  registrationId: string;
  eventId: string;
  cleanup: () => Promise<void>;
};

let nextFixtureLocationSortOrder = 1_300_000_000;
let testEventCategoryId: string;
let switchbotEnabledBefore: boolean | null = null;

const DEFAULT_RESERVATION_PRICING = {
  basePrice: 1000,
  totalPrice: 1000,
  rateBreakdownJson: {
    schemaVersion: 1,
    segments: [],
    totalHours: 0,
    totalBasePrice: 0,
    holidayFlags: {},
  },
  taxRateType: TaxRateType.standard,
  taxRate: 10,
  taxAmount: 100,
  totalPriceWithTax: 1100,
};

async function createReservationFixture(opts?: {
  startTime?: Date;
  endTime?: Date;
  status?: ReservationStatus;
}): Promise<ReservationFixture> {
  const suffix = crypto.randomUUID();
  const startTime =
    opts?.startTime ?? new Date(Date.now() + 48 * 60 * 60 * 1000);
  const endTime =
    opts?.endTime ?? new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

  const location = await prisma.location.create({
    data: {
      slug: `status-token-loc-${suffix}`,
      name: `Status Token Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureLocationSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `status-token-space-${suffix}`,
      name: `Status Token Space ${suffix}`,
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

  const customer = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `status-token-${suffix}@example.com`,
      emailCanonical: `status-token-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const reservation = await prisma.reservation.create({
    data: {
      spaceId: space.id,
      customerId: customer.id,
      startTime,
      endTime,
      status: opts?.status ?? ReservationStatus.CONFIRMED,
      ...DEFAULT_RESERVATION_PRICING,
    },
    select: { id: true },
  });

  return {
    reservationId: reservation.id,
    customerId: customer.id,
    startTime,
    endTime,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

async function createPasscodeReservationFixture(opts?: {
  startTime?: Date;
  endTime?: Date;
  passcodePlaintext?: string;
}): Promise<PasscodeReservationFixture> {
  const suffix = crypto.randomUUID();
  const startTime = opts?.startTime ?? new Date(Date.now() + 60 * 60 * 1000);
  const endTime =
    opts?.endTime ?? new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
  const passcodePlaintext = opts?.passcodePlaintext ?? "482901";
  const bufferMs = 15 * 60 * 1000;
  const passcodeStart = new Date(startTime.getTime() - bufferMs);
  const passcodeEnd = new Date(endTime.getTime() + bufferMs);

  const location = await prisma.location.create({
    data: {
      slug: `status-passcode-loc-${suffix}`,
      name: `Status Passcode Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureLocationSortOrder++,
    },
    select: { id: true },
  });

  const device = await prisma.smartLockDevice.create({
    data: {
      locationId: location.id,
      deviceId: `AA:BB:CC:DD:EE:${suffix.slice(0, 2).toUpperCase()}`,
      deviceName: "テストキーパッド",
      deviceType: SmartLockDeviceType.KEYPAD,
      isActive: true,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `status-passcode-space-${suffix}`,
      name: `Status Passcode Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      smartLockDeviceId: device.id,
    },
    select: { id: true },
  });

  const customer = await prisma.customer.create({
    data: {
      lastName: "佐藤",
      firstName: "花子",
      email: `status-passcode-${suffix}@example.com`,
      emailCanonical: `status-passcode-${suffix}@example.com`,
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
      ...DEFAULT_RESERVATION_PRICING,
    },
    select: { id: true },
  });

  await prisma.smartLockPasscode.create({
    data: {
      reservationId: reservation.id,
      deviceId: device.id,
      status: SmartLockPasscodeStatus.CONFIRMED,
      passcodeCiphertext: encryptPasscode(passcodePlaintext, {
        purpose: passcodeCryptoPurpose,
      }),
      startTime: passcodeStart,
      endTime: passcodeEnd,
      confirmedAt: new Date(),
    },
  });

  return {
    reservationId: reservation.id,
    customerId: customer.id,
    deviceId: device.id,
    startTime,
    endTime,
    passcodePlaintext,
    cleanup: async () => {
      await prisma.smartLockPasscode.deleteMany({
        where: { reservationId: reservation.id },
      });
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.smartLockDevice.deleteMany({ where: { id: device.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

async function createOtherCustomer(): Promise<{
  customerId: string;
  cleanup: () => Promise<void>;
}> {
  const suffix = crypto.randomUUID();
  const customer = await prisma.customer.create({
    data: {
      lastName: "別会員",
      firstName: "次郎",
      email: `status-token-other-${suffix}@example.com`,
      emailCanonical: `status-token-other-${suffix}@example.com`,
    },
    select: { id: true },
  });
  return {
    customerId: customer.id,
    cleanup: async () => {
      await prisma.customer.deleteMany({ where: { id: customer.id } });
    },
  };
}

async function createEventRegistrationFixture(): Promise<EventRegistrationFixture> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const fixture = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `Status Token Event ${suffix}`,
        slug: `status-token-event-${suffix}`,
        status: EventStatus.PUBLISHED,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        firstSlotStartAt: start,
        lastSlotEndAt: end,
        categoryId: testEventCategoryId,
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
        name: "一般",
        price: 1000,
        isAvailable: true,
      },
      select: { id: true },
    });

    const registration = await tx.eventRegistration.create({
      data: {
        eventId: event.id,
        slotId: slot.id,
        ticketId: ticket.id,
        name: "イベント参加者",
        quantity: 1,
        status: "CONFIRMED",
        paymentStatus: "PAID",
      },
      select: { id: true },
    });

    return { registrationId: registration.id, eventId: event.id };
  });

  return {
    ...fixture,
    cleanup: async () => {
      await prisma.eventRegistration.deleteMany({
        where: { eventId: fixture.eventId },
      });
      await prisma.eventTicket.deleteMany({
        where: { eventId: fixture.eventId },
      });
      await prisma.event.deleteMany({ where: { id: fixture.eventId } });
    },
  };
}

async function enableSwitchbotForTests(): Promise<void> {
  const current = await prisma.settingsSwitchbot.findUnique({
    where: { id: "singleton" },
    select: { switchbotEnabled: true },
  });
  switchbotEnabledBefore = current?.switchbotEnabled ?? false;
  await prisma.settingsSwitchbot.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", switchbotEnabled: true },
    update: { switchbotEnabled: true },
  });
}

async function restoreSwitchbotSettings(): Promise<void> {
  if (switchbotEnabledBefore === null) return;
  await prisma.settingsSwitchbot.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", switchbotEnabled: switchbotEnabledBefore },
    update: { switchbotEnabled: switchbotEnabledBefore },
  });
}

describeMaybe(
  "reservation status token — token round-trip with real Postgres",
  () => {
    beforeAll(async () => {
      ({ prisma } = await import("@/shared/db/prisma"));
      ({ getReservationForGuestStatus, getReservationCustomerId } =
        await import("@/shared/domain/reservations/customer-queries"));
      ({ resolveGuestStatusAccess } =
        await import("@/shared/domain/reservations/guest-status-view"));
      ({ getCustomerVisibleSmartLockPasscodesForReservation } =
        await import("@/shared/domain/smart-lock/customer-passcode-queries"));
      ({ createStatusToken, verifyStatusToken, STATUS_TOKEN_LIFETIME_MS } =
        await import("@/shared/lib/reservation-status-token"));
      ({
        createEventRegistrationStatusToken,
        verifyEventRegistrationStatusToken,
      } = await import("@/shared/lib/event-registration-status-token"));
      ({ resolveGuestEventRegistrationStatusAccess } =
        await import("@/shared/domain/events/guest-status-view"));
      ({ getEventRegistrationForGuestStatus } =
        await import("@/shared/domain/events/registration-queries"));
      ({ encrypt: encryptPasscode } = await import("@/shared/lib/crypto"));
      ({ PASSCODE_CRYPTO_PURPOSE: passcodeCryptoPurpose } =
        await import("@/shared/domain/smart-lock/issue-passcode"));

      const category = await prisma.eventCategory.create({
        data: {
          name: `Status Token Test Category ${crypto.randomUUID()}`,
          sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
        },
        select: { id: true },
      });
      testEventCategoryId = category.id;

      await enableSwitchbotForTests();
      await prisma.$queryRaw`SELECT 1`;
    });

    afterAll(async () => {
      await restoreSwitchbotSettings();
      await prisma.eventCategory.deleteMany({
        where: { id: testEventCategoryId },
      });
      await prisma.$disconnect();
    });

    test("token → verify → access → lookup: 実 reservation 行にバインドされる", async () => {
      const now = new Date();
      const { reservationId, customerId, startTime, endTime, cleanup } =
        await createReservationFixture();

      try {
        const expiresAt = new Date(now.getTime() + STATUS_TOKEN_LIFETIME_MS);
        const token = createStatusToken(reservationId, expiresAt);

        const verified = verifyStatusToken(token, now);
        expect(verified.valid).toBe(true);
        if (!verified.valid)
          throw new Error("token verify failed unexpectedly");
        expect(verified.reservationId).toBe(reservationId);

        const access = resolveGuestStatusAccess({
          token,
          rateLimitSuccess: true,
          now,
        });
        expect(access).toEqual({ kind: "ok", reservationId });
        if (access.kind !== "ok") throw new Error("expected ok access");

        const reservation = await getReservationForGuestStatus(
          access.reservationId,
        );
        expect(reservation).not.toBeNull();
        expect(reservation?.id).toBe(reservationId);
        expect(reservation?.customerId).toBe(customerId);
        expect(reservation?.startTime.getTime()).toBe(startTime.getTime());
        expect(reservation?.endTime.getTime()).toBe(endTime.getTime());
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("期限切れ token は access gate で invalid", async () => {
      const now = new Date();
      const { reservationId, cleanup } = await createReservationFixture();

      try {
        const expiredAt = new Date(now.getTime() - 1_000);
        const token = createStatusToken(reservationId, expiredAt);

        expect(verifyStatusToken(token, now)).toEqual({ valid: false });
        expect(
          resolveGuestStatusAccess({
            token,
            rateLimitSuccess: true,
            now,
          }),
        ).toEqual({ kind: "invalid" });
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("member-ownership: 別会員 session + status token は mismatch", async () => {
      const now = new Date();
      const { reservationId, cleanup } = await createReservationFixture();
      const other = await createOtherCustomer();

      try {
        const token = createStatusToken(
          reservationId,
          new Date(now.getTime() + STATUS_TOKEN_LIFETIME_MS),
        );
        const access = resolveGuestStatusAccess({
          token,
          rateLimitSuccess: true,
          now,
        });
        if (access.kind !== "ok") throw new Error("expected ok access");

        const reservation = await getReservationForGuestStatus(
          access.reservationId,
        );
        expect(reservation).not.toBeNull();

        const reservationCustomerId = await getReservationCustomerId(
          access.reservationId,
        );
        expect(reservationCustomerId).toBe(reservation?.customerId ?? null);

        const ownership = checkGuestStatusMemberOwnership({
          sessionCustomerId: other.customerId,
          resourceCustomerId: reservationCustomerId,
        });
        expect(ownership).toEqual({ kind: "mismatch" });
      } finally {
        await cleanup();
        await other.cleanup();
      }
    }, 30_000);

    test("status-token auth: passcode reveal が実 DB 行を decrypt して返す", async () => {
      const now = new Date();
      const fixture = await createPasscodeReservationFixture();
      const midWindow = new Date(
        fixture.startTime.getTime() +
          (fixture.endTime.getTime() - fixture.startTime.getTime()) / 2,
      );

      try {
        const token = createStatusToken(
          fixture.reservationId,
          new Date(now.getTime() + STATUS_TOKEN_LIFETIME_MS),
        );
        const verified = verifyStatusToken(token, midWindow);
        if (!verified.valid)
          throw new Error("token verify failed unexpectedly");

        const result = await getCustomerVisibleSmartLockPasscodesForReservation(
          fixture.reservationId,
          { kind: "status-token", reservationId: verified.reservationId },
          { reveal: true, now: midWindow },
        );

        expect(result.status).toBe("visible");
        if (result.status !== "visible" || !result.revealed) {
          throw new Error("expected revealed passcodes");
        }
        expect(result.passcodes).toEqual([
          {
            deviceName: "テストキーパッド",
            passcode: fixture.passcodePlaintext,
          },
        ]);
      } finally {
        await fixture.cleanup();
      }
    }, 30_000);

    test("status-token auth: rid 不一致は passcode query 前に unauthorized", async () => {
      const now = new Date();
      const fixture = await createPasscodeReservationFixture();
      const other = await createReservationFixture();

      try {
        const result = await getCustomerVisibleSmartLockPasscodesForReservation(
          fixture.reservationId,
          { kind: "status-token", reservationId: other.reservationId },
          { reveal: true, now },
        );
        expect(result).toEqual({ status: "unauthorized" });
      } finally {
        await fixture.cleanup();
        await other.cleanup();
      }
    }, 30_000);

    test("event registration status token: token → access → lookup が実 registration にバインド", async () => {
      const now = new Date();
      const { registrationId, cleanup } =
        await createEventRegistrationFixture();

      try {
        const expiresAt = new Date(now.getTime() + STATUS_TOKEN_LIFETIME_MS);
        const token = createEventRegistrationStatusToken(
          registrationId,
          expiresAt,
        );

        const verified = verifyEventRegistrationStatusToken(token, now);
        expect(verified.valid).toBe(true);
        if (!verified.valid)
          throw new Error("token verify failed unexpectedly");
        expect(verified.registrationId).toBe(registrationId);

        const access = resolveGuestEventRegistrationStatusAccess({
          token,
          rateLimitSuccess: true,
          now,
        });
        expect(access).toEqual({ kind: "ok", registrationId });
        if (access.kind !== "ok") throw new Error("expected ok access");

        const registration = await getEventRegistrationForGuestStatus(
          access.registrationId,
        );
        expect(registration).not.toBeNull();
        expect(registration?.id).toBe(registrationId);
      } finally {
        await cleanup();
      }
    }, 30_000);
  },
);
