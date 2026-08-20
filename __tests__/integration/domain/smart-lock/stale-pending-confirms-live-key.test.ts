/**
 * N-03: CONFIRMED 予約の 30 分超 PENDING パスコードが、Device List に live key
 * があるとき CONFIRMED になり deleteKey しないことの検証。
 *
 * stale job が名に反して live key を deleteKey すると、keyList 遅延で webhook
 * 確定できなかった正当な鍵が誤回収される。CONFIRMED 予約 + 期限内は confirm
 * に倒す。
 *
 * == 実行条件 ==
 * 実 Postgres を要求する。SwitchBot クライアントだけ mock する。
 * `TEST_DATABASE_URL` 未設定なら describe ごと skip する。
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

const LIVE_KEY_ID = "live-key-from-device-list";

const mockFindKeyInDeviceList = mock<
  (
    ...args: unknown[]
  ) => Promise<
    | { ok: true; body: { id: string } | null }
    | { ok: false; statusCode: number; message: string }
  >
>(() => Promise.resolve({ ok: true, body: { id: LIVE_KEY_ID } }));

const mockDeletePasscode = mock<
  (...args: unknown[]) => Promise<{ ok: true; body: Record<string, never> }>
>(() => Promise.resolve({ ok: true, body: {} }));

const actualSwitchbot =
  await import("@/shared/lib/smart-lock/switchbot-client");
mock.module("@/shared/lib/smart-lock/switchbot-client", () => ({
  ...actualSwitchbot,
  findKeyInDeviceList: (...args: unknown[]) => mockFindKeyInDeviceList(...args),
  deletePasscode: (...args: unknown[]) => mockDeletePasscode(...args),
}));

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedSwitchBotCredentials: () =>
    Promise.resolve({
      openToken: "open-token",
      secretKey: "secret-key",
      passcodeBufferMinutes: 0,
    }),
  getDecryptedSwitchBotCredentialsForRevocation: () =>
    Promise.resolve({ openToken: "open-token", secretKey: "secret-key" }),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type RevokeModule = typeof import("@/shared/domain/smart-lock/revoke-passcode");

let prisma: PrismaModule["prisma"];
let expireStalePendingSmartLockPasscodes: RevokeModule["expireStalePendingSmartLockPasscodes"];
let STALE_PENDING_THRESHOLD_MINUTES: RevokeModule["STALE_PENDING_THRESHOLD_MINUTES"];

let nextSortOrder = 6_000_000 + Math.floor(Math.random() * 100_000);

type Fixture = {
  passcodeId: string;
  cleanup: () => Promise<void>;
};

async function createStalePendingConfirmedReservation(): Promise<Fixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `stale-loc-${suffix}`,
      name: `Stale Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextSortOrder++,
    },
    select: { id: true },
  });

  const pad = await prisma.smartLockDevice.create({
    data: {
      locationId: location.id,
      deviceId: `STALE${suffix.slice(0, 8)}`,
      deviceName: `Stale Pad ${suffix}`,
      deviceType: "KEYPAD_TOUCH",
      isActive: true,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `stale-space-${suffix}`,
      name: `Stale Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      smartLockDeviceId: pad.id,
      isActive: true,
    },
    select: { id: true },
  });

  const customer = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `stale-${suffix}@example.com`,
      emailCanonical: `stale-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const reservation = await prisma.reservation.create({
    data: {
      customerId: customer.id,
      spaceId: space.id,
      startTime: new Date("2099-01-01T09:00:00+09:00"),
      endTime: new Date("2099-01-01T11:00:00+09:00"),
      status: "CONFIRMED",
      paymentStatus: "UNPAID",
      totalPrice: 2000,
      basePrice: 2000,
      taxRateType: "STANDARD",
      taxRate: 10,
      taxAmount: 200,
      totalPriceWithTax: 2200,
      rateBreakdownJson: {
        schemaVersion: 1,
        segments: [],
        totalHours: 0,
        totalBasePrice: 0,
        holidayFlags: {},
      },
    },
    select: { id: true },
  });

  const passcode = await prisma.smartLockPasscode.create({
    data: {
      reservationId: reservation.id,
      deviceId: pad.id,
      passcodeCiphertext: "ciphertext-placeholder",
      status: "PENDING",
      startTime: new Date("2099-01-01T09:00:00+09:00"),
      endTime: new Date("2099-01-01T11:00:00+09:00"),
    },
    select: { id: true },
  });

  return {
    passcodeId: passcode.id,
    cleanup: async () => {
      await prisma.smartLockPasscode.deleteMany({
        where: { reservationId: reservation.id },
      });
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.smartLockDevice.deleteMany({ where: { id: pad.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

describeMaybe(
  "expireStalePendingSmartLockPasscodes — CONFIRMED 予約の live key は confirm",
  () => {
    beforeAll(async () => {
      ({ prisma } = await import("@/shared/db/prisma"));
      ({
        expireStalePendingSmartLockPasscodes,
        STALE_PENDING_THRESHOLD_MINUTES,
      } = await import("@/shared/domain/smart-lock/revoke-passcode"));
      await prisma.$queryRaw`SELECT 1`;
    });

    beforeEach(() => {
      mockFindKeyInDeviceList.mockReset();
      mockDeletePasscode.mockReset();
      mockFindKeyInDeviceList.mockImplementation(() =>
        Promise.resolve({ ok: true, body: { id: LIVE_KEY_ID } }),
      );
      mockDeletePasscode.mockImplementation(() =>
        Promise.resolve({ ok: true, body: {} }),
      );
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    test("30 分超 PENDING + Device List に key あり → CONFIRMED、deleteKey しない", async () => {
      const { passcodeId, cleanup } =
        await createStalePendingConfirmedReservation();
      const now = new Date();
      const createdAt = new Date(
        now.getTime() - (STALE_PENDING_THRESHOLD_MINUTES + 1) * 60 * 1000,
      );

      try {
        await prisma.smartLockPasscode.update({
          where: { id: passcodeId },
          data: { createdAt },
        });

        await expireStalePendingSmartLockPasscodes(now);

        const row = await prisma.smartLockPasscode.findUniqueOrThrow({
          where: { id: passcodeId },
          select: { status: true, switchbotKeyId: true },
        });
        expect(row.status).toBe("CONFIRMED");
        expect(row.switchbotKeyId).toBe(LIVE_KEY_ID);
        expect(mockFindKeyInDeviceList).toHaveBeenCalled();
        expect(mockDeletePasscode).not.toHaveBeenCalled();
      } finally {
        await cleanup();
      }
    }, 30_000);
  },
);
