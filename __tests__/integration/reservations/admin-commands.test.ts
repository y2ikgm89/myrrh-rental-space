/**
 * createAdminReservationCommand — rate plan 統合 + admin override policy の
 * 実 DB 統合テスト（Task 8）。
 *
 * next/cache のモック理由は public-commands.test.ts のコメントを参照
 * （cacheComponents ランタイム外で cacheLife/cacheTag/updateTag が throw するため）。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  TaxRateType,
  DayOfWeek,
  HolidayMode,
  ReservationStatus,
} from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";

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
type AdminCommandsModule =
  typeof import("@/shared/domain/reservations/admin-commands");
type CustomerCommandsModule =
  typeof import("@/shared/domain/reservations/customer-commands");
type RatePlanCommandsModule =
  typeof import("@/shared/domain/spaces/rate-plan-commands");
type RateBreakdownModule = typeof import("@/shared/lib/pricing/rate-breakdown");

let prisma: PrismaModule["prisma"];
let createAdminReservationCommand: AdminCommandsModule["createAdminReservationCommand"];
let updateAdminReservationCommand: AdminCommandsModule["updateAdminReservationCommand"];
let updateCustomerReservation: CustomerCommandsModule["updateCustomerReservation"];
let createSpaceRatePlan: RatePlanCommandsModule["createSpaceRatePlan"];
let updateSpaceRatePlan: RatePlanCommandsModule["updateSpaceRatePlan"];
let rateBreakdownSchema: RateBreakdownModule["rateBreakdownSchema"];

// 2027-03-19 は金曜日（固定 fixture、rate plan の曜日マッチを検証するため）。
const FRIDAY_DATE = "2027-03-19";
const ADMIN_USER_ID = "00000000-0000-4000-9000-000000000001";
const OTHER_ADMIN_USER_ID = "00000000-0000-4000-9000-000000000002";
// customer-commands.test.ts と同値 (顧客 vs admin race テスト用)。
const MODIFICATION_DEADLINE_HOURS = 48;

let nextFixtureLocationSortOrder = 1_450_000_000;

type SpaceFixture = {
  spaceId: string;
  hourlyPrice: number;
  customerId: string;
  cleanup: () => Promise<void>;
};

/** Location → Space → Customer を 1 件ずつ作る最小 fixture。 */
async function createSpaceFixture(hourlyPrice = 1000): Promise<SpaceFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `admin-cmd-loc-${suffix}`,
      name: `Admin Cmd Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureLocationSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `admin-cmd-space-${suffix}`,
      name: `Admin Cmd Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
      // Space.isPublished は @default(false)。admin 経路は isPublished を
      // 要求しないが、他 2 経路のテストとの一貫性のため明示指定する。
      isPublished: true,
      isActive: true,
    },
    select: { id: true },
  });

  const customer = await prisma.customer.create({
    data: {
      lastName: "管理",
      firstName: "顧客",
      email: `admin-cmd-${suffix}@example.com`,
      emailCanonical: `admin-cmd-${suffix}@example.com`,
    },
    select: { id: true },
  });

  return {
    spaceId: space.id,
    hourlyPrice,
    customerId: customer.id,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { spaceId: space.id } });
      await prisma.spaceRatePlan.deleteMany({ where: { spaceId: space.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

type AdminReservationFixture = {
  reservationId: string;
  spaceId: string;
  customerId: string;
  date: string;
  adminUserId: string;
  cleanup: () => Promise<void>;
};

/**
 * optimistic concurrency (version) テスト用の予約 fixture。
 * createSpaceFixture (Location → Space → Customer) + createAdminReservationCommand
 * の合成で予約を 1 件作る。Reservation.version は schema `@default(0)` のため
 * 常に 0 で作成される。`opts.version` は呼出側の意図明示用
 * (現状 0 以外はサポートしない — fresh reservation は必ず version=0 で始まる)。
 */
async function createAdminReservationFixture(opts?: {
  version?: number;
}): Promise<AdminReservationFixture> {
  if (opts?.version !== undefined && opts.version !== 0) {
    throw new Error(
      "createAdminReservationFixture は version: 0 のみサポート (新規予約は常に version=0 で作成される)",
    );
  }
  const { spaceId, customerId, cleanup } = await createSpaceFixture(1000);
  const created = await createAdminReservationCommand({
    spaceId,
    date: FRIDAY_DATE,
    startTime: "09:00",
    endTime: "10:00",
    customerId,
    status: ReservationStatus.CONFIRMED,
    adminUserId: ADMIN_USER_ID,
  });
  return {
    reservationId: created.id,
    spaceId,
    customerId,
    date: FRIDAY_DATE,
    adminUserId: ADMIN_USER_ID,
    cleanup,
  };
}

/** Commerce / reservation singletons を既知値へ揃える（schema の @default と同値、他テストへの副作用ゼロ）。 */
/**
 * `adminUserId` に使う管理者を実在させる。
 *
 * `reservations.price_overridden_by_id` に FK を張るまで、この
 * テストは **`users` に存在しない ID** を書き込んでいた。FK が無いので通っており、
 * 「実行者を記録している」という assertion は**辿れない文字列**を突き合わせていた
 * だけだった。実在する行を指してはじめて「後から誰か引ける」の検査になる。
 *
 * test DB は共有なので upsert（他ファイルが同じ ID を使っても壊れない）。
 */
async function ensureAdminUsers(): Promise<void> {
  await Promise.all(
    [
      { id: ADMIN_USER_ID, label: "Admin One" },
      { id: OTHER_ADMIN_USER_ID, label: "Admin Two" },
    ].map(({ id, label }) =>
      prisma.user.upsert({
        where: { id },
        create: {
          id,
          name: label,
          email: `admin-commands-${id}@example.test`,
          emailVerified: false,
          role: "ADMIN",
        },
        update: {},
      }),
    ),
  );
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
    // 2 時間の fixture 予約が確実に通るよう、期間ルールも既知値へ揃える
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
  ]);
}

describeMaybe(
  "createAdminReservationCommand — rate plan 統合 + override policy",
  () => {
    beforeAll(async () => {
      ({ prisma } = await import("@/shared/db/prisma"));
      ({ createAdminReservationCommand, updateAdminReservationCommand } =
        await import("@/shared/domain/reservations/admin-commands"));
      ({ updateCustomerReservation } =
        await import("@/shared/domain/reservations/customer-commands"));
      ({ createSpaceRatePlan, updateSpaceRatePlan } =
        await import("@/shared/domain/spaces/rate-plan-commands"));
      ({ rateBreakdownSchema } =
        await import("@/shared/lib/pricing/rate-breakdown"));
      await prisma.$queryRaw`SELECT 1`;
      await ensureAdminUsers();
      await ensureKnownSettings();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    test("rate plan なしで従来通り予約作成できる (regression)", async () => {
      const { spaceId, hourlyPrice, customerId, cleanup } =
        await createSpaceFixture(1000);
      try {
        const result = await createAdminReservationCommand({
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          adminUserId: ADMIN_USER_ID,
        });

        const reservation = await prisma.reservation.findUniqueOrThrow({
          where: { id: result.id },
        });
        const rateBreakdown = rateBreakdownSchema.parse(
          reservation.rateBreakdownJson,
        );

        expect(rateBreakdown.segments[0]?.hourlyPrice).toBe(hourlyPrice);
        expect(rateBreakdown.segments[0]?.ratePlanId).toBeNull();

        expect(reservation.taxRateType).toBe(TaxRateType.STANDARD);
        expect(reservation.taxRate).toBe(10);

        // totalPrice は NOT NULL 列だが result 拡張の型は number | null
        // (decimalToNumber の防御的シグネチャ) のため明示的に narrow する。
        if (reservation.totalPrice === null) {
          throw new Error("totalPrice must not be null");
        }
        const expectedTaxAmount = Math.round(
          (reservation.totalPrice * 10) / 100,
        );
        expect(reservation.taxAmount).toBe(expectedTaxAmount);
        expect(reservation.totalPriceWithTax).toBe(
          reservation.totalPrice + expectedTaxAmount,
        );
        expect(reservation.priceOverriddenById).toBeNull();
      } finally {
        await cleanup();
      }
    });

    test("曜日別 rate plan が適用される", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture(1000);
      try {
        const plan = await createSpaceRatePlan({
          spaceId,
          name: "金曜特別料金",
          hourlyPrice: 2000,
          daysOfWeek: [DayOfWeek.FRIDAY],
          holidayMode: HolidayMode.ANY,
          startTime: null,
          endTime: null,
          effectiveFrom: null,
          effectiveTo: null,
        });

        const result = await createAdminReservationCommand({
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          adminUserId: ADMIN_USER_ID,
        });

        const reservation = await prisma.reservation.findUniqueOrThrow({
          where: { id: result.id },
        });
        const rateBreakdown = rateBreakdownSchema.parse(
          reservation.rateBreakdownJson,
        );

        expect(rateBreakdown.segments[0]?.ratePlanId).toBe(plan.id);
        expect(rateBreakdown.segments[0]?.hourlyPrice).toBe(2000);
        // hourlyPrice=2000（rate plan）× 2h = 4000（space の基本料金 1000 ではない）
        expect(reservation.basePrice).toBe(4000);
        expect(reservation.totalPrice).toBe(4000);
      } finally {
        await cleanup();
      }
    });

    test("rate plan 変更後も既存予約の rateBreakdownJson が snapshot として不変", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture(1000);
      try {
        const plan = await createSpaceRatePlan({
          spaceId,
          name: "金曜特別料金",
          hourlyPrice: 2000,
          daysOfWeek: [DayOfWeek.FRIDAY],
          holidayMode: HolidayMode.ANY,
          startTime: null,
          endTime: null,
          effectiveFrom: null,
          effectiveTo: null,
        });

        const result = await createAdminReservationCommand({
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          adminUserId: ADMIN_USER_ID,
        });

        const before = await prisma.reservation.findUniqueOrThrow({
          where: { id: result.id },
        });

        await updateSpaceRatePlan(plan.id, { hourlyPrice: 9999 });

        const after = await prisma.reservation.findUniqueOrThrow({
          where: { id: result.id },
        });

        expect(after.rateBreakdownJson).toEqual(before.rateBreakdownJson);
        expect(after.basePrice).toBe(before.basePrice);
        expect(after.totalPrice).toBe(before.totalPrice);
      } finally {
        await cleanup();
      }
    });

    test("admin override: totalPrice のみ上書き、rateBreakdownJson.segments は保持", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture(1000);
      try {
        const result = await createAdminReservationCommand({
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          totalPrice: 10000, // override（計算値は 2000 = 1000×2h）
          adminUserId: ADMIN_USER_ID,
        });

        const reservation = await prisma.reservation.findUniqueOrThrow({
          where: { id: result.id },
        });
        const rateBreakdown = rateBreakdownSchema.parse(
          reservation.rateBreakdownJson,
        );

        expect(reservation.totalPrice).toBe(10000);
        // rateBreakdownJson は override 前の rate 解決結果のスナップショットのまま
        // （override は totalPrice/taxAmount/totalPriceWithTax のみに作用する）。
        expect(rateBreakdown.segments.length).toBeGreaterThan(0);
        expect(reservation.basePrice).toBe(2000);
        // 税は override 後の totalPrice から派生: 10000 × 10% = 1000
        expect(reservation.taxAmount).toBe(1000);
        expect(reservation.totalPriceWithTax).toBe(11000);
        expect(reservation.priceOverriddenById).toBe(ADMIN_USER_ID);
      } finally {
        await cleanup();
      }
    });

    test("admin override (update): totalPrice のみ上書き、税は作成時点の taxRate スナップショットから派生", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture(1000);
      try {
        // override なしで作成: totalPrice=2000（1000×2h）、taxRate snapshot=10%
        const created = await createAdminReservationCommand({
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          adminUserId: ADMIN_USER_ID,
        });

        // 別の管理者が update で totalPrice を override。
        const updateResult = await updateAdminReservationCommand(created.id, {
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          totalPrice: 5000, // override
          adminUserId: OTHER_ADMIN_USER_ID,
          numberOfGuests: 1,
          version: 0,
        });
        expect(updateResult.payload.reservationId).toBe(created.id);

        const reservation = await prisma.reservation.findUniqueOrThrow({
          where: { id: created.id },
        });

        expect(reservation.totalPrice).toBe(5000);
        // taxRate 自体は作成時点のスナップショット (10%) のまま
        // (update は totalPrice を書き換えても taxRate/taxRateType は変更しない方針)。
        expect(reservation.taxRate).toBe(10);
        expect(reservation.taxAmount).toBe(500); // 5000 × 10% = 500
        expect(reservation.totalPriceWithTax).toBe(5500);
        expect(reservation.priceOverriddenById).toBe(OTHER_ADMIN_USER_ID);
      } finally {
        await cleanup();
      }
    });

    test("update で totalPrice を省略すると既存の priceOverriddenById が保持される（no-op 保存で override フラグが消える Codex P1 #1105 の回帰防止）", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture(1000);
      try {
        // override ありで作成: totalPrice=10000（計算値は 2000 = 1000×2h）
        const created = await createAdminReservationCommand({
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          totalPrice: 10000,
          adminUserId: ADMIN_USER_ID,
        });

        // 別の管理者が totalPrice を指定せずに update する
        // （manualPrice が空のまま送信される通常の日時/スペース編集保存を模す —
        // Task 8 handoff の pre-fill 撤去後の client 挙動）。
        const updateResult = await updateAdminReservationCommand(created.id, {
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          adminUserId: OTHER_ADMIN_USER_ID,
          numberOfGuests: 1,
          version: 0,
        });
        expect(updateResult.payload.reservationId).toBe(created.id);

        const reservation = await prisma.reservation.findUniqueOrThrow({
          where: { id: created.id },
        });

        // priceOverriddenById は「今回の update 呼び出し元 (OTHER_ADMIN_USER_ID)」
        // ではなく、元の override 実行者のまま保持される
        // （totalPrice 省略時はフィールド自体を update payload に書かないため）。
        expect(reservation.priceOverriddenById).toBe(ADMIN_USER_ID);
        // totalPrice は override 値 (10000) ではなく、現在の rate plan から
        // 再計算された値 (1000×2h=2000) になる。仕様: totalPrice 省略時は
        // 常に再計算する。保持されるのは priceOverriddenById フラグのみ
        // （「過去に手動調整されたことがある」という監査情報）。
        expect(reservation.totalPrice).toBe(2000);
      } finally {
        await cleanup();
      }
    });

    test("update で totalPrice を省略しても未 override の予約は priceOverriddenById が null のまま（regression）", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture(1000);
      try {
        // override なしで作成: priceOverriddenById=null
        const created = await createAdminReservationCommand({
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          adminUserId: ADMIN_USER_ID,
        });

        const updateResult = await updateAdminReservationCommand(created.id, {
          spaceId,
          date: FRIDAY_DATE,
          startTime: "10:00",
          endTime: "12:00",
          customerId,
          status: "CONFIRMED",
          notes: "メモのみ変更",
          adminUserId: OTHER_ADMIN_USER_ID,
          numberOfGuests: 1,
          version: 0,
        });
        expect(updateResult.payload.reservationId).toBe(created.id);

        const reservation = await prisma.reservation.findUniqueOrThrow({
          where: { id: created.id },
        });

        expect(reservation.priceOverriddenById).toBeNull();
        expect(reservation.totalPrice).toBe(2000);
      } finally {
        await cleanup();
      }
    });

    describe("optimistic concurrency (version)", () => {
      test("regression: 単発 admin update で version が 0 → 1 に increment", async () => {
        const fixture = await createAdminReservationFixture({ version: 0 });
        try {
          await updateAdminReservationCommand(fixture.reservationId, {
            spaceId: fixture.spaceId,
            date: fixture.date,
            startTime: "10:00",
            endTime: "11:00",
            customerId: fixture.customerId,
            status: ReservationStatus.CONFIRMED,
            adminUserId: fixture.adminUserId,
            numberOfGuests: 1,
            version: 0,
          });
          const after = await prisma.reservation.findUniqueOrThrow({
            where: { id: fixture.reservationId },
            select: { version: true },
          });
          expect(after.version).toBe(1);
        } finally {
          await fixture.cleanup();
        }
      });

      test("admin タブ間 race: 同 version=0 の 2 update で 1 succeed / 1 CONFLICT", async () => {
        const fixture = await createAdminReservationFixture({ version: 0 });
        try {
          const results = await Promise.allSettled([
            updateAdminReservationCommand(fixture.reservationId, {
              spaceId: fixture.spaceId,
              date: fixture.date,
              startTime: "10:00",
              endTime: "11:00",
              customerId: fixture.customerId,
              status: ReservationStatus.CONFIRMED,
              adminUserId: fixture.adminUserId,
              numberOfGuests: 1,
              version: 0,
            }),
            updateAdminReservationCommand(fixture.reservationId, {
              spaceId: fixture.spaceId,
              date: fixture.date,
              startTime: "14:00",
              endTime: "15:00",
              customerId: fixture.customerId,
              status: ReservationStatus.CONFIRMED,
              adminUserId: fixture.adminUserId,
              numberOfGuests: 1,
              version: 0,
            }),
          ]);
          const fulfilled = results.filter((r) => r.status === "fulfilled");
          const rejected = results.filter((r) => r.status === "rejected");
          expect(fulfilled).toHaveLength(1);
          expect(rejected).toHaveLength(1);
          const err = (rejected[0]! as PromiseRejectedResult).reason;
          expect(err).toBeInstanceOf(DomainError);
          expect((err as DomainError).code).toBe("CONFLICT");
        } finally {
          await fixture.cleanup();
        }
      });

      test("顧客 vs admin race: 顧客が version=0 で保持中に admin が版数を進める → 顧客 submit が CONFLICT", async () => {
        const fixture = await createAdminReservationFixture({ version: 0 });
        try {
          // admin が version=0 で update → version=1
          await updateAdminReservationCommand(fixture.reservationId, {
            spaceId: fixture.spaceId,
            date: fixture.date,
            startTime: "10:00",
            endTime: "11:00",
            customerId: fixture.customerId,
            status: ReservationStatus.CONFIRMED,
            adminUserId: fixture.adminUserId,
            numberOfGuests: 1,
            version: 0,
          });

          // 顧客は古い version=0 のまま submit → CONFLICT
          const customerResult = await updateCustomerReservation(
            fixture.reservationId,
            fixture.customerId,
            {
              spaceId: fixture.spaceId,
              date: fixture.date,
              startTime: "14:00",
              endTime: "15:00",
              numberOfGuests: 1,
              version: 0,
            },
            MODIFICATION_DEADLINE_HOURS,
          );
          expect(customerResult.success).toBe(false);
          if (!customerResult.success) {
            expect(customerResult.error).toContain(
              "予約情報が別のデバイスまたはタブで変更されました",
            );
          }
        } finally {
          await fixture.cleanup();
        }
      });

      test("admin vs 顧客 race (逆方向): 顧客が version=0 で版数を進めた後、admin が古い version=0 で submit すると CONFLICT", async () => {
        const fixture = await createAdminReservationFixture({ version: 0 });
        try {
          // 顧客が version=0 で update → version=1
          const customerResult = await updateCustomerReservation(
            fixture.reservationId,
            fixture.customerId,
            {
              spaceId: fixture.spaceId,
              date: fixture.date,
              startTime: "10:00",
              endTime: "11:00",
              numberOfGuests: 1,
              version: 0,
            },
            MODIFICATION_DEADLINE_HOURS,
          );
          expect(customerResult.success).toBe(true);

          // 顧客の $transaction commit 直後に admin 側の最初の非 tx query
          // (prisma.reservation.findUnique) を同一 microtask chain で発行すると、
          // この test 環境 (bun 1.3.14 + @prisma/adapter-pg) では commit 後の
          // コネクション解放が完了する前に次の query が dispatch され、Postgres
          // 側 (pg_stat_activity / pg_locks) に到達すらしないまま無期限に hang する
          // ことを実機で確認した (setImmediate 1 tick 挿入のみで再現しなくなる純粋な
          // microtask race)。既存の admin→顧客方向のテスト (直前の describe) は
          // admin 側の書込 tx の後に軽い customer 側 outer read が続くだけで発生
          // しないため方向依存。本番は顧客 request と admin request が別 HTTP
          // request = 別 event loop tick のため影響しない test-only の quirk。
          await new Promise((resolve) => setImmediate(resolve));

          // admin は古い version=0 のまま submit → CONFLICT
          await expect(
            updateAdminReservationCommand(fixture.reservationId, {
              spaceId: fixture.spaceId,
              date: fixture.date,
              startTime: "14:00",
              endTime: "15:00",
              customerId: fixture.customerId,
              status: ReservationStatus.CONFIRMED,
              adminUserId: fixture.adminUserId,
              numberOfGuests: 1,
              version: 0,
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
        } finally {
          await fixture.cleanup();
        }
      });
    });
  },
);
