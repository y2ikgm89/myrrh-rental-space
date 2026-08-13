/**
 * 当日受付（WALK_IN）と管理者代行（ADMIN_PROXY）の申込を、未決済 fail-safe cron が
 * 自動キャンセルしないことを実 DB で検証する。
 *
 * == 何が壊れていたか ==
 *
 * `EventRegistration` の既定は `status = CONFIRMED` / `paymentStatus = UNPAID`。
 * 当日受付も管理者代行もこの 2 列を指定していなかったので、公開申込で checkout を
 * 開いたまま離脱した行と**まったく同じ形**になっていた。
 *
 * cron の除外条件は `ticket.price > 0` だけで、これは無料チケットしか守らない。
 * 結果、**有料イベントの当日受付は 60 分で自動キャンセルされていた**。
 * 出席打刻（`attendedAt`）済みでもキャンセル通知メールが飛び、物理的に埋まって
 * いる席へキャンセル待ちが繰り上がる。
 *
 * 会員 / ゲストの別では区別できない（公開申込のゲストも `customerId = null`）。
 * そのため作成経路そのものを `EventRegistrationSource` として列に持たせた。
 *
 * == なぜ実 DB か ==
 *
 * 不変条件は Prisma の WHERE 述語そのものにある。mock を挟むテストは「渡した
 * WHERE オブジェクト」を写経するだけで、その述語が実際にどの行へ一致するかを
 * 確かめられない。ここでは実 Postgres に行を作り、cron の実装本体を通して、
 * 残ったか消えたかを見る。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 * `TEST_DATABASE_URL` 未設定なら describe ごと skip する（dev DB 汚染防止）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  EventRegistrationSource,
  EventScheduleMode,
  EventStatus,
  PaymentStatus,
  RegistrationStatus,
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

let prisma: PrismaModule["prisma"];
let expireStaleUnpaidEventRegistrationsCommand: UnpaidExpiryModule["expireStaleUnpaidEventRegistrationsCommand"];

/** 通常 cutoff（60 分）より十分古い。 */
const LONG_AGO = new Date("2020-01-01T00:00:00.000Z");

let fixtureCategorySortOrder = 1;

type Cleanup = () => Promise<void>;

/**
 * 失敗しても作った行を残さないための後片付けヘルパー。
 * `defer` に渡した順の逆で実行する。
 */
async function withRollback<T>(
  build: (defer: (fn: Cleanup) => void) => Promise<T>,
): Promise<{ value: T; cleanup: Cleanup }> {
  const deferred: Cleanup[] = [];
  const defer = (fn: Cleanup): void => {
    deferred.push(fn);
  };
  const runAll = async (): Promise<void> => {
    for (const fn of [...deferred].reverse()) {
      await fn();
    }
  };

  try {
    const value = await build(defer);
    return { value, cleanup: runAll };
  } catch (error) {
    await runAll();
    throw error;
  }
}

async function createRegistration(opts: {
  readonly source: (typeof EventRegistrationSource)[keyof typeof EventRegistrationSource];
  readonly attended: boolean;
  /** 管理画面から Stripe 決済リンクを作った行を再現する。 */
  readonly stripeCheckoutSessionId?: string | null;
  readonly paymentStatus?: (typeof PaymentStatus)[keyof typeof PaymentStatus];
}): Promise<{ registrationId: string; cleanup: Cleanup }> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const { value, cleanup } = await withRollback(async (defer) => {
    const category = await prisma.eventCategory.create({
      data: {
        name: `当日受付テスト ${suffix}`,
        sortOrder: fixtureCategorySortOrder++,
      },
      select: { id: true },
    });
    defer(async () => {
      await prisma.eventCategory.deleteMany({ where: { id: category.id } });
    });

    // Event と EventTimeSlot は同一トランザクションで作る。`SINGLE_OCCURRENCE` は
    // 「slot がちょうど 1 件」を DEFERRABLE な CONSTRAINT TRIGGER で強制しており、
    // 判定は commit 時に走る。個別 create（= 個別 autocommit）だと必ず落ちる。
    const { event, slot, ticket } = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.event.create({
        data: {
          title: `当日受付テスト ${suffix}`,
          slug: `walk-in-${suffix}`,
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
      // 有料チケット。cron の `ticket.price > 0` を満たす（= 無料チケットの
      // 免除では守られない形）ことがこのテストの前提。
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
        email: `walk-in-${suffix}@example.com`,
        quantity: 1,
        source: opts.source,
        // 現地集金・請求書払いの実際の形。既定と同じ値を明示している。
        status: RegistrationStatus.CONFIRMED,
        paymentStatus: opts.paymentStatus ?? PaymentStatus.UNPAID,
        stripeCheckoutSessionId: opts.stripeCheckoutSessionId ?? null,
        attendedAt: opts.attended ? new Date() : null,
      },
      select: { id: true },
    });
    defer(async () => {
      await prisma.eventRegistration.deleteMany({
        where: { id: registration.id },
      });
    });

    // UNPAID の枝は `createdAt`、PENDING / FAILED の枝は `updatedAt` を見る。
    // どちらも Prisma 経由では過去に倒せないので raw で書く。
    await prisma.$executeRaw`UPDATE "event_registrations" SET "created_at" = ${LONG_AGO}, "updated_at" = ${LONG_AGO} WHERE "id" = ${registration.id}::uuid`;

    return registration.id;
  });

  return { registrationId: value, cleanup };
}

async function statusOf(registrationId: string): Promise<string> {
  const row = await prisma.eventRegistration.findUniqueOrThrow({
    where: { id: registrationId },
    select: { status: true },
  });
  return row.status;
}

describeMaybe("未決済 fail-safe cron は場外集金の申込を消さない", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ expireStaleUnpaidEventRegistrationsCommand } =
      await import("@/shared/domain/events/unpaid-expiry"));
    await prisma.$queryRaw`SELECT 1`;

    // 共有 test-db の現状より上から採番する（固定値だと残骸と衝突して落ちる）。
    const maxCategory = await prisma.eventCategory.aggregate({
      _max: { sortOrder: true },
    });
    fixtureCategorySortOrder = (maxCategory._max.sortOrder ?? 0) + 1;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("当日受付（出席打刻済み）は cutoff を過ぎても CONFIRMED のまま", async () => {
    const { registrationId, cleanup } = await createRegistration({
      source: EventRegistrationSource.WALK_IN,
      attended: true,
    });
    try {
      await expireStaleUnpaidEventRegistrationsCommand();

      expect(await statusOf(registrationId)).toBe(RegistrationStatus.CONFIRMED);
    } finally {
      await cleanup();
    }
  });

  test("管理者代行の事前登録も CONFIRMED のまま", async () => {
    const { registrationId, cleanup } = await createRegistration({
      source: EventRegistrationSource.ADMIN_PROXY,
      attended: false,
    });
    try {
      await expireStaleUnpaidEventRegistrationsCommand();

      expect(await statusOf(registrationId)).toBe(RegistrationStatus.CONFIRMED);
    } finally {
      await cleanup();
    }
  });

  test("当日受付でも Stripe 決済リンクを作って放置されたら回収される", async () => {
    // 管理画面の「Stripe決済」は source を見ずに出せる（`isManuallyPayable` は
    // CONFIRMED + UNPAID + session 無しでしか判定しない）。放置されると
    // `checkout.session.expired` が FAILED に落とすが status は CONFIRMED のまま。
    // source だけで除外すると、この席が永久に解放されない（Codex P1, PR #2228）。
    const { registrationId, cleanup } = await createRegistration({
      source: EventRegistrationSource.WALK_IN,
      attended: false,
      stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
      paymentStatus: PaymentStatus.FAILED,
    });
    try {
      await expireStaleUnpaidEventRegistrationsCommand();

      expect(await statusOf(registrationId)).toBe(RegistrationStatus.CANCELLED);
    } finally {
      await cleanup();
    }
  });

  test("公開申込は従来どおり CANCELLED になる（除外が広すぎないこと）", async () => {
    const { registrationId, cleanup } = await createRegistration({
      source: EventRegistrationSource.ONLINE,
      attended: false,
    });
    try {
      await expireStaleUnpaidEventRegistrationsCommand();

      expect(await statusOf(registrationId)).toBe(RegistrationStatus.CANCELLED);
    } finally {
      await cleanup();
    }
  });
});
