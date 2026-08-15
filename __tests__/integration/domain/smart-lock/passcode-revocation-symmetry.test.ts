/**
 * パスコードの発行・失効が、割当の状態変化と対称であることの検証。
 *
 * == なぜ要るのか ==
 *
 * 監査 F-24 / F-25 / F-67 / F-68 は 4 件とも同じ形の欠陥だった。
 * **状態が変わる経路が複数あり、その一部だけが副作用を持っていた。**
 *
 * - **F-24**: 一覧のトグルで無効化すると失効するのに、編集ダイアログの isActive
 *   スイッチでは失効しない。発行済みコードが物理 Keypad 上で生き続ける。
 * - **F-25**: Pad A → Pad B の直接付け替えで、旧 Pad の失効も新 Pad の発行も走らない。
 *   予約者は「予約していない旧ドアを開けられ、実際のドアを開けられない」。
 * - **F-67**: revoke は行を消さず REVOKED を残すのに、発行側は `none: {}` で
 *   「行が 1 件も無い」を条件にしていた。解除 → 再割当の正規手順で発行されない。
 * - **F-68**: 拠点変更で Pad を外すが失効しない。旧拠点の Keypad が既存予約の
 *   終了時刻まで開き続ける。旧拠点は第三者に引き渡し済みかもしれない。
 *
 * == 何を mock するか ==
 *
 * SwitchBot を叩く末端（`issue-passcode` / `revoke-passcode`）と管理者認証だけ。
 * **どの予約が対象になるかを決める query は実 DB で走らせる** — 欠陥はそこにあり、
 * where 句を mock に写経しても何も確かめられない。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
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

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: () => Promise.resolve(),
}));
mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
}));

// SwitchBot を叩く末端だけ差し替える。`assignment-side-effects` の query は本物。
const issuedFor = new Set<string>();
const revokedFor = new Set<string>();

const actualIssue = await import("@/shared/domain/smart-lock/issue-passcode");
mock.module("@/shared/domain/smart-lock/issue-passcode", () => ({
  ...actualIssue,
  issueSmartLockPasscodes: (input: { reservationId: string }) => {
    issuedFor.add(input.reservationId);
    return Promise.resolve();
  },
}));

const actualRevoke = await import("@/shared/domain/smart-lock/revoke-passcode");
mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  ...actualRevoke,
  revokeSmartLockPasscodesForReservation: (reservationId: string) => {
    revokedFor.add(reservationId);
    return Promise.resolve();
  },
}));

// fire-and-forget を await 可能にする（発行側は fireAndForget 経由）。
const pending: Promise<unknown>[] = [];
const actualAsyncUtils = await import("@/shared/lib/async-utils");
mock.module("@/shared/lib/async-utils", () => ({
  ...actualAsyncUtils,
  fireAndForget: (promise: Promise<unknown>) => {
    pending.push(promise);
  },
}));

// 管理者認証は素通し（execute の中身だけを見る）。
type ExecuteOpts<T> = {
  resource: string;
  action: string;
  resourceId?: string;
  execute: (user: { id: string; role: string }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
};
mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: async <T>(opts: ExecuteOpts<T>) => {
    const data = await opts.execute({ id: "admin-user-id", role: "ADMIN" });
    await opts.afterSuccess?.(data);
    return data;
  },
}));
mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCache: () => {},
}));

// 画像 URL が管理メディア由来かの検査は、この経路の関心ではない。
mock.module("@/shared/domain/media/managed-image-assertions", () => ({
  assertAllowedManagedImageUrl: () => {},
  assertAllowedManagedImageUrls: () => {},
  assertAllowedManagedGallery: () => {},
  assertAllowedManagedImageSourcesInJson: () => {},
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type SideEffectsModule =
  typeof import("@/shared/domain/smart-lock/assignment-side-effects");
type SpaceDeviceActionModule =
  typeof import("@/app/(admin)/admin/(dashboard)/_shared/actions/space-smart-lock-devices");
type SpaceCommandsModule = typeof import("@/shared/domain/spaces/commands");
type SmartLockCommandsModule =
  typeof import("@/shared/domain/smart-lock/commands");

let prisma: PrismaModule["prisma"];
let issuePasscodesAfterSpaceBound: SideEffectsModule["issuePasscodesAfterSpaceBound"];
let setSpaceSmartLockDevice: SpaceDeviceActionModule["setSpaceSmartLockDevice"];
let updateSpaceCommand: SpaceCommandsModule["updateSpaceCommand"];
let updateSmartLockDeviceCommand: SmartLockCommandsModule["updateSmartLockDeviceCommand"];

type EnumsModule = typeof import("@generated/prisma/enums");
type PasscodeStatus =
  EnumsModule["SmartLockPasscodeStatus"][keyof EnumsModule["SmartLockPasscodeStatus"]];

let nextSortOrder = 5_000_000 + Math.floor(Math.random() * 100_000);

type Fixture = {
  spaceId: string;
  locationId: string;
  otherLocationId: string;
  padAId: string;
  padBId: string;
  reservationId: string;
  cleanup: () => Promise<void>;
};

async function createFixture(opts: {
  /** 予約に紐づける既存パスコードの status（null なら作らない）。 */
  readonly passcodeStatus: PasscodeStatus | null;
}): Promise<Fixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `sl-loc-${suffix}`,
      name: `SL Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextSortOrder++,
    },
    select: { id: true },
  });
  const otherLocation = await prisma.location.create({
    data: {
      slug: `sl-loc2-${suffix}`,
      name: `SL Loc2 ${suffix}`,
      address: "東京都テスト区4-5-6",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextSortOrder++,
    },
    select: { id: true },
  });

  const padA = await prisma.smartLockDevice.create({
    data: {
      locationId: location.id,
      deviceId: `PADA${suffix.slice(0, 8)}`,
      deviceName: `Pad A ${suffix}`,
      deviceType: "KEYPAD_TOUCH",
      isActive: true,
    },
    select: { id: true },
  });
  const padB = await prisma.smartLockDevice.create({
    data: {
      locationId: location.id,
      deviceId: `PADB${suffix.slice(0, 8)}`,
      deviceName: `Pad B ${suffix}`,
      deviceType: "KEYPAD_TOUCH",
      isActive: true,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `sl-space-${suffix}`,
      name: `SL Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      smartLockDeviceId: padA.id,
      isActive: true,
    },
    select: { id: true },
  });
  const customer = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `sl-${suffix}@example.com`,
      emailCanonical: `sl-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const reservation = await prisma.reservation.create({
    data: {
      customerId: customer.id,
      spaceId: space.id,
      // 未来（endTime 未到来）の CONFIRMED 予約が副作用の対象。
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

  if (opts.passcodeStatus !== null) {
    await prisma.smartLockPasscode.create({
      data: {
        reservationId: reservation.id,
        deviceId: padA.id,
        // 実際の暗号文である必要はない（この経路は複号しない）。
        passcodeCiphertext: "ciphertext-placeholder",
        status: opts.passcodeStatus,
        startTime: new Date("2099-01-01T09:00:00+09:00"),
        endTime: new Date("2099-01-01T11:00:00+09:00"),
      },
    });
  }

  return {
    spaceId: space.id,
    locationId: location.id,
    otherLocationId: otherLocation.id,
    padAId: padA.id,
    padBId: padB.id,
    reservationId: reservation.id,
    cleanup: async () => {
      await prisma.smartLockPasscode.deleteMany({
        where: { reservationId: reservation.id },
      });
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.smartLockDevice.deleteMany({
        where: { id: { in: [padA.id, padB.id] } },
      });
      await prisma.location.deleteMany({
        where: { id: { in: [location.id, otherLocation.id] } },
      });
    },
  };
}

async function settlePending(): Promise<void> {
  while (pending.length > 0) {
    const batch = pending.splice(0, pending.length);
    await Promise.all(batch);
  }
}

describeMaybe("スマートロック: 発行と失効の対称性", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ issuePasscodesAfterSpaceBound } =
      await import("@/shared/domain/smart-lock/assignment-side-effects"));
    ({ setSpaceSmartLockDevice } =
      await import("@/app/(admin)/admin/(dashboard)/_shared/actions/space-smart-lock-devices"));
    ({ updateSpaceCommand } = await import("@/shared/domain/spaces/commands"));
    ({ updateSmartLockDeviceCommand } =
      await import("@/shared/domain/smart-lock/commands"));
    await prisma.$queryRaw`SELECT 1`;
  });

  beforeEach(() => {
    issuedFor.clear();
    revokedFor.clear();
    pending.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // F-67
  test("REVOKED 行しか無い予約も再発行の対象になる", async () => {
    const f = await createFixture({ passcodeStatus: "REVOKED" });

    try {
      issuePasscodesAfterSpaceBound(f.spaceId);
      await settlePending();

      // `none: {}` のままだと REVOKED 行の存在だけで除外され、顧客は当日
      // ドアを開けられない。
      expect([...issuedFor]).toEqual([f.reservationId]);
    } finally {
      await f.cleanup();
    }
  });

  test("生きたパスコードがある予約は二重発行しない", async () => {
    const f = await createFixture({ passcodeStatus: "CONFIRMED" });

    try {
      issuePasscodesAfterSpaceBound(f.spaceId);
      await settlePending();

      expect([...issuedFor]).toEqual([]);
    } finally {
      await f.cleanup();
    }
  });

  // F-25
  test("Pad A → Pad B の直接付け替えで、旧 Pad を失効し新 Pad へ発行する", async () => {
    const f = await createFixture({ passcodeStatus: "CONFIRMED" });

    try {
      await setSpaceSmartLockDevice(f.spaceId, f.padBId);
      await settlePending();

      expect([...revokedFor]).toEqual([f.reservationId]);
      // 失効後は生きたパスコードが無くなるので、発行側も対象にできる。
      // （このテストでは revoke を mock しているため行は CONFIRMED のまま残り、
      //   発行側の対象にはならない。失効が呼ばれたことがここでの主張。）
      expect(revokedFor.size).toBe(1);
    } finally {
      await f.cleanup();
    }
  });

  test("同じ Pad を選び直しただけなら何も起こさない", async () => {
    const f = await createFixture({ passcodeStatus: "CONFIRMED" });

    try {
      await setSpaceSmartLockDevice(f.spaceId, f.padAId);
      await settlePending();

      expect([...revokedFor]).toEqual([]);
      expect([...issuedFor]).toEqual([]);
    } finally {
      await f.cleanup();
    }
  });

  // F-68
  test("拠点変更で Pad を外したら、その事実を呼び出し側へ返す", async () => {
    const f = await createFixture({ passcodeStatus: "CONFIRMED" });

    try {
      const result = await updateSpaceCommand(f.spaceId, {
        name: "SL Space renamed",
        slug: `sl-space-renamed-${crypto.randomUUID()}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        capacity: 10,
        hourlyPrice: 1000,
        mainImageUrl: "https://example.com/space.jpg",
        gallery: [],
        facilities: [],
        isPublished: false,
        reviewsEnabled: false,
        locationId: f.otherLocationId,
        taxRateType: "STANDARD",
      });

      expect(result.smartLockUnbound).toBe(true);
      const after = await prisma.space.findUniqueOrThrow({
        where: { id: f.spaceId },
        select: { smartLockDeviceId: true },
      });
      expect(after.smartLockDeviceId).toBeNull();
    } finally {
      await f.cleanup();
    }
  });

  // F-24
  test("編集経由で isActive を false にしたら、無効化されたことを返す", async () => {
    const f = await createFixture({ passcodeStatus: "CONFIRMED" });

    try {
      const result = await updateSmartLockDeviceCommand(f.padAId, {
        deviceId: `PADA${crypto.randomUUID().slice(0, 8)}`,
        deviceName: "Pad A renamed",
        deviceType: "KEYPAD_TOUCH",
        isActive: false,
      } as Parameters<typeof updateSmartLockDeviceCommand>[1]);

      expect(result.deactivated).toBe(true);
    } finally {
      await f.cleanup();
    }
  });

  test("isActive が変わらない編集では無効化と判定しない", async () => {
    const f = await createFixture({ passcodeStatus: "CONFIRMED" });

    try {
      const result = await updateSmartLockDeviceCommand(f.padAId, {
        deviceId: `PADA${crypto.randomUUID().slice(0, 8)}`,
        deviceName: "Pad A renamed",
        deviceType: "KEYPAD_TOUCH",
        isActive: true,
      } as Parameters<typeof updateSmartLockDeviceCommand>[1]);

      expect(result.deactivated).toBe(false);
    } finally {
      await f.cleanup();
    }
  });
});
