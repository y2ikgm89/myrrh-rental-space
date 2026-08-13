/**
 * 非同期決済（konbini / customer_balance）が確定する前に fail-safe cron が
 * 予約・イベント申込をキャンセルしないことを、実 DB で検証する。
 *
 * == なぜ実 DB か ==
 *
 * この不変条件は Prisma の WHERE 述語そのものにある。mock を挟むテストは
 * 「渡した WHERE オブジェクト」を写経するだけで、その述語が実際にどの行に
 * 一致するかを一切確かめられない（本監査で確定した既存欠陥 9 件は、まさに
 * その形のテストをすり抜けてきた）。ここでは実 Postgres に行を作り、
 * cron の実装本体を通して、残ったか消えたかを見る。
 *
 * == 何を守っているか ==
 *
 * Stripe の非同期決済では `checkout.session.completed` が
 * `payment_status !== "paid"` で先に届き、アプリは PaymentIntent だけ保存して
 * paymentStatus を PENDING のまま維持する（客は払込票を受け取り、これから支払う）。
 * この状態を「未払い放置」と見なして cron が CANCELLED にすると、数日後に
 * 実際に支払われた時点で `async_payment_succeeded` が届き、キャンセル済みの
 * 予約・申込に対する自動返金が走る。枠は失われ、入金と返金の履歴だけが残る。
 *
 * 枠が永久に埋まることはない: 払込票が期限切れになれば Stripe が
 * `checkout.session.async_payment_failed` を送り、`claim*AsFailed` が FAILED に
 * 落とすので、通常の failed 経路で回収される。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 * `TEST_DATABASE_URL` 未設定なら describe ごと skip する（dev DB 汚染防止）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
  PaymentStatus,
  RegistrationStatus,
  ReservationStatus,
  TaxRateType,
} from "@generated/prisma/enums";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type UnpaidExpiryModule = typeof import("@/shared/domain/events/unpaid-expiry");
type PendingExpiryModule =
  typeof import("@/shared/domain/reservations/pending-expiry");

let prisma: PrismaModule["prisma"];
let expireStaleUnpaidEventRegistrationsCommand: UnpaidExpiryModule["expireStaleUnpaidEventRegistrationsCommand"];
let expireStalePendingReservationsCommand: PendingExpiryModule["expireStalePendingReservationsCommand"];

/** 通常 cutoff (60 分) より古いが、非同期決済の backstop (14 日) よりは新しい */
const LONG_AGO = new Date(Date.now() - 6 * 60 * 60 * 1000);

/** 非同期決済の backstop (14 日) すら過ぎた時刻 */
const VERY_LONG_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

const RESERVATION_PRICING = {
  basePrice: 1000,
  totalPrice: 1000,
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
} as const;

// Location.sortOrder / EventCategory.sortOrder はどちらも unique 制約を持つ。
// 既定 0 のままだと 2 件目で必ず落ちるので採番するが、開始値は固定値ではなく
// beforeAll で実 DB の最大値から決める。共有 test-db には過去の実行が残した行が
// あるため、固定値だと「前回の残骸と衝突して落ちる」不安定なテストになる。
let fixtureLocationSortOrder = 0;
let fixtureCategorySortOrder = 0;

type Cleanup = () => Promise<void>;

/** 途中で失敗しても、それまでに作った行を必ず片付ける（孤児を残さない）。 */
async function withRollback<T>(
  build: (defer: (cleanup: Cleanup) => void) => Promise<T>,
): Promise<{ value: T; cleanup: Cleanup }> {
  const stack: Cleanup[] = [];
  const runAll = async () => {
    for (const cleanup of stack.reverse()) await cleanup();
  };
  try {
    const value = await build((cleanup) => stack.push(cleanup));
    return { value, cleanup: runAll };
  } catch (error) {
    await runAll();
    throw error;
  }
}

async function createEventRegistration(opts: {
  readonly stripePaymentIntentId: string | null;
  readonly age?: Date;
}): Promise<{ registrationId: string; cleanup: Cleanup }> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const { value, cleanup } = await withRollback(async (defer) => {
    const category = await prisma.eventCategory.create({
      data: {
        name: `非同期決済テスト ${suffix}`,
        sortOrder: fixtureCategorySortOrder++,
      },
      select: { id: true },
    });
    defer(async () => {
      await prisma.eventCategory.deleteMany({ where: { id: category.id } });
    });

    // Event と EventTimeSlot は同一トランザクションで作る。
    // `SINGLE_OCCURRENCE` は「slot がちょうど 1 件」を DEFERRABLE な
    // CONSTRAINT TRIGGER で強制しており、判定は commit 時に走る。
    // 個別 create（= 個別 autocommit）だと event だけの commit で必ず落ちる。
    const { event, slot, ticket } = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.event.create({
        data: {
          title: `非同期決済テスト ${suffix}`,
          slug: `async-pay-${suffix}`,
          status: EventStatus.PUBLISHED,
          descriptionJson: { type: "doc" },
          descriptionHtml: "<p>test</p>",
          descriptionPlainText: "test",
          scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
          registrationOpen: true,
          firstSlotStartAt: start,
          lastSlotEndAt: end,
          categoryId: category.id,
        },
        select: { id: true },
      });
      const createdSlot = await tx.eventTimeSlot.create({
        data: {
          eventId: createdEvent.id,
          startAt: start,
          endAt: end,
          capacity: 10,
        },
        select: { id: true },
      });
      const createdTicket = await tx.eventTicket.create({
        data: {
          eventId: createdEvent.id,
          name: "有料",
          price: 3000,
          isAvailable: true,
        },
        select: { id: true },
      });
      return { event: createdEvent, slot: createdSlot, ticket: createdTicket };
    });
    defer(async () => {
      // 削除も同じ理由で 1 トランザクションにまとめる（slot だけ消した commit は落ちる）。
      await prisma.$transaction(async (tx) => {
        await tx.eventTicket.deleteMany({ where: { id: ticket.id } });
        await tx.eventTimeSlot.deleteMany({ where: { id: slot.id } });
        await tx.event.deleteMany({ where: { id: event.id } });
      });
    });

    const registration = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        slotId: slot.id,
        ticketId: ticket.id,
        name: "山田太郎",
        email: `async-pay-${suffix}@example.com`,
        quantity: 1,
        status: RegistrationStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PENDING,
        // 実運用では非同期決済でも session id は入るが、Stripe の session expire は
        // キャンセルされた行に対してだけ走る。テストを外部呼び出しから隔離するため null。
        stripeCheckoutSessionId: null,
        stripePaymentIntentId: opts.stripePaymentIntentId,
      },
      select: { id: true },
    });
    defer(async () => {
      await prisma.eventRegistration.deleteMany({
        where: { id: registration.id },
      });
    });

    // `updatedAt` は @updatedAt なので Prisma 経由では過去に倒せない。
    await prisma.$executeRaw`UPDATE "event_registrations" SET "updated_at" = ${opts.age ?? LONG_AGO} WHERE "id" = ${registration.id}::uuid`;

    return registration.id;
  });

  return { registrationId: value, cleanup };
}

async function createReservation(opts: {
  readonly stripePaymentIntentId: string | null;
  readonly age?: Date;
  readonly paymentStatus?: (typeof PaymentStatus)[keyof typeof PaymentStatus];
}): Promise<{ reservationId: string; cleanup: Cleanup }> {
  const suffix = crypto.randomUUID();
  const startTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

  const location = await prisma.location.create({
    data: {
      slug: `async-pay-loc-${suffix}`,
      name: `Async Pay Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: fixtureLocationSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `async-pay-space-${suffix}`,
      name: `Async Pay Space ${suffix}`,
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
      email: `async-pay-${suffix}@example.com`,
      emailCanonical: `async-pay-${suffix}@example.com`,
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
      paymentStatus: opts.paymentStatus ?? PaymentStatus.PENDING,
      paymentInitiatedAt: opts.age ?? LONG_AGO,
      stripeCheckoutSessionId: null,
      stripePaymentIntentId: opts.stripePaymentIntentId,
      ...RESERVATION_PRICING,
    },
    select: { id: true },
  });

  // `updatedAt` は @updatedAt なので Prisma 経由では過去に倒せない。
  // FAILED 枝は `updatedAt` を見るため、fixture 側でも合わせる。
  await prisma.$executeRaw`UPDATE "reservations" SET "updated_at" = ${opts.age ?? LONG_AGO} WHERE "id" = ${reservation.id}::uuid`;

  return {
    reservationId: reservation.id,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

describeMaybe("fail-safe cron は非同期決済の確定前にキャンセルしない", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ expireStaleUnpaidEventRegistrationsCommand } =
      await import("@/shared/domain/events/unpaid-expiry"));
    ({ expireStalePendingReservationsCommand } =
      await import("@/shared/domain/reservations/pending-expiry"));
    await prisma.$queryRaw`SELECT 1`;

    // 共有 test-db の現状より上から採番する（固定値だと残骸と衝突して落ちる）。
    const [maxLocation, maxCategory] = await Promise.all([
      prisma.location.aggregate({ _max: { sortOrder: true } }),
      prisma.eventCategory.aggregate({ _max: { sortOrder: true } }),
    ]);
    fixtureLocationSortOrder = (maxLocation._max.sortOrder ?? 0) + 1;
    fixtureCategorySortOrder = (maxCategory._max.sortOrder ?? 0) + 1;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("イベント申込: PaymentIntent がある PENDING は cutoff を過ぎても CONFIRMED のまま", async () => {
    const { registrationId, cleanup } = await createEventRegistration({
      stripePaymentIntentId: `pi_async_${crypto.randomUUID()}`,
    });
    try {
      await expireStaleUnpaidEventRegistrationsCommand();

      const after = await prisma.eventRegistration.findUniqueOrThrow({
        where: { id: registrationId },
        select: { status: true, paymentStatus: true },
      });
      expect(after.status).toBe(RegistrationStatus.CONFIRMED);
      expect(after.paymentStatus).toBe(PaymentStatus.PENDING);
    } finally {
      await cleanup();
    }
  });

  test("イベント申込: PaymentIntent が無い PENDING は従来どおり CANCELLED になる", async () => {
    const { registrationId, cleanup } = await createEventRegistration({
      stripePaymentIntentId: null,
    });
    try {
      await expireStaleUnpaidEventRegistrationsCommand();

      const after = await prisma.eventRegistration.findUniqueOrThrow({
        where: { id: registrationId },
        select: { status: true },
      });
      expect(after.status).toBe(RegistrationStatus.CANCELLED);
    } finally {
      await cleanup();
    }
  });

  test("予約: PaymentIntent がある PENDING は cutoff を過ぎても CONFIRMED のまま", async () => {
    const { reservationId, cleanup } = await createReservation({
      stripePaymentIntentId: `pi_async_${crypto.randomUUID()}`,
    });
    try {
      await expireStalePendingReservationsCommand();

      const after = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservationId },
        select: { status: true, paymentStatus: true },
      });
      expect(after.status).toBe(ReservationStatus.CONFIRMED);
      expect(after.paymentStatus).toBe(PaymentStatus.PENDING);
    } finally {
      await cleanup();
    }
  });

  test("予約: PaymentIntent が無い PENDING は従来どおり CANCELLED になる", async () => {
    const { reservationId, cleanup } = await createReservation({
      stripePaymentIntentId: null,
    });
    try {
      await expireStalePendingReservationsCommand();

      const after = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservationId },
        select: { status: true },
      });
      expect(after.status).toBe(ReservationStatus.CANCELLED);
    } finally {
      await cleanup();
    }
  });

  // --- 以下 3 件は Codex レビュー (PR #2215) で指摘された 2 点への回帰テスト ---

  test("予約: FAILED は枠を解放する（webhook が終端に落としたあと誰も回収しない穴）", async () => {
    // `claimReservationAsFailed` は paymentStatus しか動かさない。EXCLUDE 制約は
    // status で枠を押さえるので、この枝が無いと枠が恒久的に埋まったままになる。
    const { reservationId, cleanup } = await createReservation({
      stripePaymentIntentId: `pi_failed_${crypto.randomUUID()}`,
      paymentStatus: PaymentStatus.FAILED,
    });
    try {
      await expireStalePendingReservationsCommand();

      const after = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservationId },
        select: { status: true },
      });
      expect(after.status).toBe(ReservationStatus.CANCELLED);
    } finally {
      await cleanup();
    }
  });

  test("予約: 失敗した直後の FAILED は残す（再決済の猶予を潰さない）", async () => {
    // `claimReservationAsFailed` は paymentStatus しか書かない。Stripe session の
    // expires_at は checkout 開始 + 60 分なので、`paymentInitiatedAt` を基準にすると
    // FAILED が書かれた瞬間に回収対象になり、FAILED → PENDING の再決済導線が使えない。
    const { reservationId, cleanup } = await createReservation({
      stripePaymentIntentId: null,
      paymentStatus: PaymentStatus.FAILED,
      // 決済開始は十分前だが、失敗したのは「たった今」
      age: new Date(),
    });
    try {
      await prisma.$executeRaw`UPDATE "reservations" SET "payment_initiated_at" = ${LONG_AGO} WHERE "id" = ${reservationId}::uuid`;

      await expireStalePendingReservationsCommand();

      const after = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservationId },
        select: { status: true },
      });
      expect(after.status).toBe(ReservationStatus.CONFIRMED);
    } finally {
      await cleanup();
    }
  });

  test("予約: 非同期決済でも backstop を超えたら CANCELLED になる（永久除外しない）", async () => {
    const { reservationId, cleanup } = await createReservation({
      stripePaymentIntentId: `pi_async_${crypto.randomUUID()}`,
      age: VERY_LONG_AGO,
    });
    try {
      await expireStalePendingReservationsCommand();

      const after = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservationId },
        select: { status: true },
      });
      expect(after.status).toBe(ReservationStatus.CANCELLED);
    } finally {
      await cleanup();
    }
  });

  test("イベント申込: 非同期決済でも backstop を超えたら CANCELLED になる（永久除外しない）", async () => {
    const { registrationId, cleanup } = await createEventRegistration({
      stripePaymentIntentId: `pi_async_${crypto.randomUUID()}`,
      age: VERY_LONG_AGO,
    });
    try {
      await expireStaleUnpaidEventRegistrationsCommand();

      const after = await prisma.eventRegistration.findUniqueOrThrow({
        where: { id: registrationId },
        select: { status: true },
      });
      expect(after.status).toBe(RegistrationStatus.CANCELLED);
    } finally {
      await cleanup();
    }
  });
});
