/**
 * N-04: REVOKED 行しか無い予約で `issueSmartLockPasscodes` が行を消して
 * 再発行することの検証。
 *
 * finder は REVOKED のみの予約を再 issue 対象に含めるが、発行側が REVOKED を
 * PENDING 扱いの silent no-op にすると、Pad 解除→再割当で鍵が出ない。
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

const REISSUED_KEY_ID = "reissued-key-id";

const mockCreatePasscode = mock<
  (...args: unknown[]) => Promise<{ ok: true; body: { commandId: string } }>
>(() => Promise.resolve({ ok: true, body: { commandId: "cmd-reissue" } }));

const mockFindKeyInDeviceList = mock<
  (...args: unknown[]) => Promise<
    | {
        ok: true;
        body: {
          id: string;
          name: string;
          type: "timeLimit";
          password: string;
          iv: string;
          status: "normal";
          createTime: number;
        };
      }
    | { ok: false; statusCode: number; message: string }
  >
>(() =>
  Promise.resolve({
    ok: true,
    body: {
      id: REISSUED_KEY_ID,
      name: "reissued",
      type: "timeLimit",
      password: "enc",
      iv: "iv",
      status: "normal",
      createTime: 1_700_000_000,
    },
  }),
);

const actualSwitchbot =
  await import("@/shared/lib/smart-lock/switchbot-client");
mock.module("@/shared/lib/smart-lock/switchbot-client", () => ({
  ...actualSwitchbot,
  createPasscode: (...args: unknown[]) => mockCreatePasscode(...args),
  findKeyInDeviceList: (...args: unknown[]) => mockFindKeyInDeviceList(...args),
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

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: () => Promise.resolve(),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type IssueModule = typeof import("@/shared/domain/smart-lock/issue-passcode");

let prisma: PrismaModule["prisma"];
let issueSmartLockPasscodes: IssueModule["issueSmartLockPasscodes"];

let nextSortOrder = 6_100_000 + Math.floor(Math.random() * 100_000);

type Fixture = {
  reservationId: string;
  spaceId: string;
  revokedPasscodeId: string;
  startTime: Date;
  endTime: Date;
  cleanup: () => Promise<void>;
};

async function createReservationWithRevokedPasscode(): Promise<Fixture> {
  const suffix = crypto.randomUUID();
  const startTime = new Date("2099-02-01T09:00:00+09:00");
  const endTime = new Date("2099-02-01T11:00:00+09:00");

  const location = await prisma.location.create({
    data: {
      slug: `reissue-loc-${suffix}`,
      name: `Reissue Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextSortOrder++,
    },
    select: { id: true },
  });

  const pad = await prisma.smartLockDevice.create({
    data: {
      locationId: location.id,
      deviceId: `REISS${suffix.slice(0, 8)}`,
      deviceName: `Reissue Pad ${suffix}`,
      deviceType: "KEYPAD_TOUCH",
      isActive: true,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `reissue-space-${suffix}`,
      name: `Reissue Space ${suffix}`,
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
      email: `reissue-${suffix}@example.com`,
      emailCanonical: `reissue-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const reservation = await prisma.reservation.create({
    data: {
      customerId: customer.id,
      spaceId: space.id,
      startTime,
      endTime,
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
      passcodeCiphertext: "ciphertext-revoked",
      status: "REVOKED",
      startTime,
      endTime,
    },
    select: { id: true },
  });

  return {
    reservationId: reservation.id,
    spaceId: space.id,
    revokedPasscodeId: passcode.id,
    startTime,
    endTime,
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
  "issueSmartLockPasscodes — REVOKED 行は削除してから再発行する",
  () => {
    beforeAll(async () => {
      ({ prisma } = await import("@/shared/db/prisma"));
      ({ issueSmartLockPasscodes } =
        await import("@/shared/domain/smart-lock/issue-passcode"));
      await prisma.$queryRaw`SELECT 1`;
    });

    beforeEach(() => {
      mockCreatePasscode.mockReset();
      mockFindKeyInDeviceList.mockReset();
      mockCreatePasscode.mockImplementation(() =>
        Promise.resolve({ ok: true, body: { commandId: "cmd-reissue" } }),
      );
      mockFindKeyInDeviceList.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          body: {
            id: REISSUED_KEY_ID,
            name: "reissued",
            type: "timeLimit",
            password: "enc",
            iv: "iv",
            status: "normal",
            createTime: 1_700_000_000,
          },
        }),
      );
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    test("REVOKED のみの予約は silent no-op せず、行を消して createKey する", async () => {
      const fixture = await createReservationWithRevokedPasscode();

      try {
        const result = await issueSmartLockPasscodes({
          reservationId: fixture.reservationId,
          spaceId: fixture.spaceId,
          startTime: fixture.startTime,
          endTime: fixture.endTime,
        });

        expect(result.issuanceFailed).toBe(false);
        expect(result.passcodes).toHaveLength(1);
        expect(mockCreatePasscode).toHaveBeenCalledTimes(1);

        const leftover = await prisma.smartLockPasscode.findUnique({
          where: { id: fixture.revokedPasscodeId },
        });
        expect(leftover).toBeNull();

        const rows = await prisma.smartLockPasscode.findMany({
          where: { reservationId: fixture.reservationId },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.id).not.toBe(fixture.revokedPasscodeId);
        expect(rows[0]?.status).toBe("CONFIRMED");
        expect(rows[0]?.switchbotKeyId).toBe(REISSUED_KEY_ID);
      } finally {
        await fixture.cleanup();
      }
    }, 30_000);
  },
);
