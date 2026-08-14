/**
 * 顧客ライフサイクル（匿名化・統合）のあとで、メールの宛先判定が正しいことの検証。
 *
 * == なぜ要るのか ==
 *
 * 監査 F-44 と F-112 は逆向きの欠陥で、どちらも `suppressedEmailHash` という
 * **リセット経路の無い列**が絡む。
 *
 * - **F-112（送るべきでないのに送る）**: 退会で `emailCanonical` が
 *   `deleted+<uuid>@anonymized.local` になるが suppression には載らない。
 *   `.local` は MX を持たないので送れば必ず hard bounce し、その後は
 *   `reason="suppressed"` で cron が claim を解放し続けるループになる。
 * - **F-44（送るべきなのに送らない）**: ゲスト行が bounce → 同じアドレスで会員登録
 *   → 履歴統合、という正常な流れで、**会員の現用アドレスの hash が恒久 suppression
 *   として焼かれる**。統合でゲスト行は消えるので status 経路の抑制は解けるのに、
 *   hash 経路だけが残り、以後その会員宛のメールが全部無言で drop される。
 *   しかも当時 `suppressedEmailHash` を null に戻すコードは 1 箇所も無かった。
 *
 * == 実 DB を使う理由 ==
 *
 * 判定は `getSuppressedEmailSet()` が返す集合と、cron の母集合クエリが返す行で
 * しか確かめられない。どちらも「行を書いて読み直す」以外に観測手段が無い。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

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

type PrismaModule = typeof import("@/shared/db/prisma");
type LifecycleModule =
  typeof import("@/shared/domain/customers/customer-lifecycle-commands");
type QueriesModule = typeof import("@/shared/domain/customers/queries");
type CommandsModule = typeof import("@/shared/domain/customers/commands");
type AdminQueriesModule =
  typeof import("@/shared/domain/reservations/admin-queries");
type SuppressionHashModule =
  typeof import("@/shared/lib/email/suppression-hash");

let prisma: PrismaModule["prisma"];
let anonymizeCustomerCommand: LifecycleModule["anonymizeCustomerCommand"];
let mergeCustomerCommand: LifecycleModule["mergeCustomerCommand"];
let getSuppressedEmailSet: QueriesModule["getSuppressedEmailSet"];
let resetCustomerEmailDeliveryStatusCommand: CommandsModule["resetCustomerEmailDeliveryStatusCommand"];
let findReservationsForReminderWindow: AdminQueriesModule["findReservationsForReminderWindow"];
let hashSuppressedEmailCandidate: SuppressionHashModule["hashSuppressedEmailCandidate"];

let nextSortOrder = 6_000_000 + Math.floor(Math.random() * 100_000);

async function createCustomer(opts: {
  readonly email: string;
  readonly emailDeliveryStatus?: string;
}): Promise<string> {
  const row = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: opts.email,
      emailCanonical: opts.email.toLowerCase(),
      ...(opts.emailDeliveryStatus === undefined
        ? {}
        : {
            emailDeliveryStatus: opts.emailDeliveryStatus as
              "HARD_BOUNCED" | "COMPLAINED",
          }),
    },
    select: { id: true },
  });
  return row.id;
}

/** 未来の CONFIRMED 予約を 1 件持つ顧客を作る。 */
async function createCustomerWithFutureReservation(): Promise<{
  customerId: string;
  reservationId: string;
  startTime: Date;
  cleanup: () => Promise<void>;
}> {
  const suffix = crypto.randomUUID();
  const location = await prisma.location.create({
    data: {
      slug: `sup-loc-${suffix}`,
      name: `Sup Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextSortOrder++,
    },
    select: { id: true },
  });
  const space = await prisma.space.create({
    data: {
      slug: `sup-space-${suffix}`,
      name: `Sup Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>t</p>",
      descriptionPlainText: "t",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
    },
    select: { id: true },
  });
  const customerId = await createCustomer({
    email: `sup-${suffix}@example.com`,
  });

  const startTime = new Date("2099-03-01T09:00:00+09:00");
  const reservation = await prisma.reservation.create({
    data: {
      customerId,
      spaceId: space.id,
      startTime,
      endTime: new Date("2099-03-01T11:00:00+09:00"),
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

  return {
    customerId,
    reservationId: reservation.id,
    startTime,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.customer.deleteMany({ where: { id: customerId } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

describeMaybe("顧客ライフサイクル後のメール宛先判定", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ anonymizeCustomerCommand, mergeCustomerCommand } =
      await import("@/shared/domain/customers/customer-lifecycle-commands"));
    ({ getSuppressedEmailSet } =
      await import("@/shared/domain/customers/queries"));
    ({ resetCustomerEmailDeliveryStatusCommand } =
      await import("@/shared/domain/customers/commands"));
    ({ findReservationsForReminderWindow } =
      await import("@/shared/domain/reservations/admin-queries"));
    ({ hashSuppressedEmailCandidate } =
      await import("@/shared/lib/email/suppression-hash"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // F-112
  test("匿名化した顧客の placeholder は最初から送信対象外になる", async () => {
    const f = await createCustomerWithFutureReservation();

    try {
      await anonymizeCustomerCommand({
        customerId: f.customerId,
        reason: "customer-requested",
      });

      const after = await prisma.customer.findUniqueOrThrow({
        where: { id: f.customerId },
        select: { emailCanonical: true, suppressedEmailHash: true },
      });

      // placeholder は MX の無い `.local`。送れば必ず hard bounce する。
      expect(after.emailCanonical).toContain("@anonymized.local");
      expect(after.suppressedEmailHash).toBe(
        hashSuppressedEmailCandidate(after.emailCanonical),
      );

      const suppressed = await getSuppressedEmailSet();
      expect(
        suppressed.has(hashSuppressedEmailCandidate(after.emailCanonical)),
      ).toBe(true);
    } finally {
      await f.cleanup();
    }
  });

  // F-112
  test("匿名化した顧客の予約はリマインダ cron の母集合から外れる", async () => {
    const f = await createCustomerWithFutureReservation();
    const from = new Date("2099-03-01T00:00:00+09:00");
    const to = new Date("2099-03-02T00:00:00+09:00");

    try {
      const before = await findReservationsForReminderWindow(from, to);
      expect(before.map((r) => r.id)).toContain(f.reservationId);

      await anonymizeCustomerCommand({
        customerId: f.customerId,
        reason: "customer-requested",
      });

      const after = await findReservationsForReminderWindow(from, to);
      expect(after.map((r) => r.id)).not.toContain(f.reservationId);
    } finally {
      await f.cleanup();
    }
  });

  // F-44
  test("同じアドレスの統合で、生きている会員アドレスを恒久抑制しない", async () => {
    const suffix = crypto.randomUUID();
    const email = `merge-${suffix}@example.com`;
    // 1) ゲスト行が hard bounce した
    const sourceId = await createCustomer({
      email,
      emailDeliveryStatus: "HARD_BOUNCED",
    });
    // 2) 同じ人が同じアドレスで会員登録した（配信は正常）
    const targetId = await createCustomer({ email: `member-${suffix}@x.com` });
    await prisma.customer.update({
      where: { id: targetId },
      data: { email, emailCanonical: email.toLowerCase() },
    });

    try {
      // 3) 履歴統合
      const result = await mergeCustomerCommand(sourceId, targetId);

      const target = await prisma.customer.findUniqueOrThrow({
        where: { id: targetId },
        select: { suppressedEmailHash: true },
      });

      // 焼くと、統合でゲスト行が消えて status 経路の抑制が解けても hash 側が残り、
      // この会員宛のメールが全部無言で drop される。
      expect(target.suppressedEmailHash).toBeNull();
      expect(result.preservedSuppression).toBe(false);
    } finally {
      await prisma.customer.deleteMany({
        where: { id: { in: [sourceId, targetId] } },
      });
    }
  });

  // F-44
  test("別アドレスの統合では、元アドレスの抑制を持ち越す", async () => {
    const suffix = crypto.randomUUID();
    const sourceId = await createCustomer({
      email: `old-${suffix}@example.com`,
      emailDeliveryStatus: "HARD_BOUNCED",
    });
    const targetId = await createCustomer({
      email: `new-${suffix}@example.com`,
    });

    try {
      const result = await mergeCustomerCommand(sourceId, targetId);

      const target = await prisma.customer.findUniqueOrThrow({
        where: { id: targetId },
        select: { suppressedEmailHash: true },
      });

      expect(target.suppressedEmailHash).toBe(
        hashSuppressedEmailCandidate(`old-${suffix}@example.com`),
      );
      expect(result.preservedSuppression).toBe(true);
    } finally {
      await prisma.customer.deleteMany({
        where: { id: { in: [sourceId, targetId] } },
      });
    }
  });

  // F-44 (b)
  test("配信状態のリセットは hash 経路の抑制も解除する", async () => {
    const suffix = crypto.randomUUID();
    const customerId = await createCustomer({
      email: `reset-${suffix}@example.com`,
    });
    await prisma.customer.update({
      where: { id: customerId },
      data: { suppressedEmailHash: hashSuppressedEmailCandidate("old@x.com") },
    });

    try {
      // status は OK のまま。旧実装はここで即 return し、hash が残り続けた。
      await resetCustomerEmailDeliveryStatusCommand(customerId);

      const after = await prisma.customer.findUniqueOrThrow({
        where: { id: customerId },
        select: { suppressedEmailHash: true },
      });
      expect(after.suppressedEmailHash).toBeNull();
    } finally {
      await prisma.customer.deleteMany({ where: { id: customerId } });
    }
  });
});
