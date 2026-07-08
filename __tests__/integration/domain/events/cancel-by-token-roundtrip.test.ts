/**
 * `createCancelToken → verifyCancelToken → cancelEventRegistrationByToken` の実
 * Postgres round-trip 統合テスト。
 *
 * **このテストが守る不変条件**:
 *   1. AES-256-GCM + HKDF + base64url の wire format が server 起動 〜 DB 反映まで
 *      壊れずに往復する（payload に焼いた `rid` で実申込を確実に解決できる）。
 *   2. `applyEventRegistrationCancellation` の atomic claim（updateMany WHERE
 *      status:CONFIRMED）が実 Postgres 上でも race を構造的に閉じる
 *      （並行二重 cancel で勝者は 1 回だけ）。
 *   3. キャンセル経路の `cancelledByType` が `CUSTOMER_TOKEN` で確実に DB に記録される。
 *
 * `reservations/cancel-by-token-roundtrip.test.ts` と同型（対象ドメインのみ相違）。
 *
 * Event/EventTimeSlot/EventTicket は `events_schedule_integrity_check`
 * （DEFERRABLE CONSTRAINT TRIGGER、SINGLE_OCCURRENCE イベントは slot がちょうど 1 件）
 * のため 1 トランザクションでの作成を要求する。テストごとに event を作り直すと
 * `$transaction` 呼出しが積み重なり、driver adapter の interactive transaction
 * スロット枯渇を誘発したため、event/slot/ticket は `beforeAll` で 1 回だけ作り、
 * 各テストは対象 slot に紐づく `EventRegistration` 行のみを都度作成する
 * （`reservations` 版が Space/Customer を毎回 create しても問題にならないのは
 * $transaction を伴わないため。event 側は $transaction コストのある fixture を
 * 使い回す必要がある）。
 *
 * == 実行条件 ==
 *   ローカル: bun run test:integration
 *   CI: unit-tests job が postgres service + prisma migrate deploy 済みのため自動実行。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す（静的 import は gateway を引かないため、
// この代入は動的 import より先に実行される）。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule =
  typeof import("@/shared/domain/events/registration-commands");
type TokenModule =
  typeof import("@/shared/lib/event-registration-cancel-token");
type ClaimModule = typeof import("@/shared/domain/events/claim-commands");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let claimEventRegistrationForCustomer: ClaimModule["claimEventRegistrationForCustomer"];
let cancelEventRegistrationByToken: CommandsModule["cancelEventRegistrationByToken"];
let createCancelToken: TokenModule["createCancelToken"];
let verifyCancelToken: TokenModule["verifyCancelToken"];
let computeCancelTokenExpiresAt: TokenModule["computeCancelTokenExpiresAt"];

const FUTURE_SLOT_START = new Date(Date.now() + 48 * 60 * 60 * 1000);
const FUTURE_SLOT_END = new Date(
  FUTURE_SLOT_START.getTime() + 2 * 60 * 60 * 1000,
);
const PAST_SLOT_START = new Date(Date.now() - 60 * 60 * 1000);
const PAST_SLOT_END = new Date(PAST_SLOT_START.getTime() + 2 * 60 * 60 * 1000);

type SharedEventFixture = {
  eventId: string;
  slotId: string;
  ticketId: string;
};

let futureEvent: SharedEventFixture;
let pastEvent: SharedEventFixture;

/** SINGLE_OCCURRENCE の Event + EventTimeSlot + EventTicket を 1 セット作る（1 トランザクション）。 */
async function createSharedEvent(
  slotStartAt: Date,
  slotEndAt: Date,
): Promise<SharedEventFixture> {
  const suffix = crypto.randomUUID();
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `Cancel Token Event ${suffix}`,
        slug: `cancel-token-event-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        status: EventStatus.PUBLISHED,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        firstSlotStartAt: slotStartAt,
        lastSlotEndAt: slotEndAt,
      },
      select: { id: true },
    });

    const slot = await tx.eventTimeSlot.create({
      data: {
        eventId: event.id,
        startAt: slotStartAt,
        endAt: slotEndAt,
        capacity: 1000,
      },
      select: { id: true },
    });

    const ticket = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: "一般",
        price: 0,
        capacity: null,
        isAvailable: true,
      },
      select: { id: true },
    });

    return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
  });
}

/** 事前作成済みの共有 slot に、この 1 テスト専用の EventRegistration 行だけを作る（$transaction 不要）。 */
async function createRegistration(shared: SharedEventFixture): Promise<{
  registrationId: string;
  cleanup: () => Promise<void>;
}> {
  const suffix = crypto.randomUUID();
  const registration = await prisma.eventRegistration.create({
    data: {
      eventId: shared.eventId,
      slotId: shared.slotId,
      ticketId: shared.ticketId,
      name: "山田太郎",
      email: `cancel-token-${suffix}@example.com`,
      quantity: 1,
      status: RegistrationStatus.CONFIRMED,
    },
    select: { id: true },
  });

  return {
    registrationId: registration.id,
    cleanup: async () => {
      await prisma.eventRegistration.deleteMany({
        where: { id: registration.id },
      });
    },
  };
}

describeMaybe(
  "cancelEventRegistrationByToken — token round-trip with real Postgres",
  () => {
    beforeAll(async () => {
      ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
      ({ cancelEventRegistrationByToken } =
        await import("@/shared/domain/events/registration-commands"));
      ({ createCancelToken, verifyCancelToken, computeCancelTokenExpiresAt } =
        await import("@/shared/lib/event-registration-cancel-token"));
      ({ claimEventRegistrationForCustomer } =
        await import("@/shared/domain/events/claim-commands"));
      // 接続プールをウォームアップ（コールドスタートで初回クエリがブレるのを防ぐ）。
      await prisma.$queryRaw`SELECT 1`;

      futureEvent = await createSharedEvent(FUTURE_SLOT_START, FUTURE_SLOT_END);
      pastEvent = await createSharedEvent(PAST_SLOT_START, PAST_SLOT_END);
    });

    afterAll(async () => {
      // Event → EventTimeSlot は onDelete: Cascade のため event 削除のみで良い。
      await prisma.event.deleteMany({
        where: { id: { in: [futureEvent.eventId, pastEvent.eventId] } },
      });
      await basePrisma.$disconnect();
    });

    test("token → verify → cancel: 申込が CANCELLED + CUSTOMER_TOKEN として永続化される", async () => {
      const { registrationId, cleanup } = await createRegistration(futureEvent);

      try {
        const expiresAt = computeCancelTokenExpiresAt(FUTURE_SLOT_START);
        const token = createCancelToken(registrationId, expiresAt);

        const verified = verifyCancelToken(token, new Date());
        expect(verified.valid).toBe(true);
        if (!verified.valid)
          throw new Error("token verify failed unexpectedly");
        expect(verified.registrationId).toBe(registrationId);

        const result = await cancelEventRegistrationByToken(
          verified.registrationId,
        );
        expect(result.id).toBe(registrationId);

        const updated = await prisma.eventRegistration.findUnique({
          where: { id: registrationId },
          select: {
            status: true,
            cancelledByType: true,
            cancelledAt: true,
            icsSequence: true,
          },
        });
        expect(updated?.status).toBe(RegistrationStatus.CANCELLED);
        expect(updated?.cancelledByType).toBe("CUSTOMER_TOKEN");
        expect(updated?.cancelledAt).toBeInstanceOf(Date);
        // 初期 icsSequence=0、cancel で +1
        expect(updated?.icsSequence).toBe(1);
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("expectedCustomerId 再検証: 事前チェック後に claim されると cancel は CONFLICT で弾かれる（TOCTOU race 対策）", async () => {
      const { registrationId, cleanup } = await createRegistration(futureEvent);
      const suffix = crypto.randomUUID();
      const customer = await prisma.customer.create({
        data: {
          lastName: "鈴木",
          firstName: "花子",
          email: `cancel-race-${suffix}@example.com`,
          emailCanonical: `cancel-race-${suffix}@example.com`,
        },
        select: { id: true },
      });

      try {
        const expiresAt = computeCancelTokenExpiresAt(FUTURE_SLOT_START);
        const token = createCancelToken(registrationId, expiresAt);
        const verified = verifyCancelToken(token, new Date());
        if (!verified.valid)
          throw new Error("token verify failed unexpectedly");

        // 「ログイン中ユーザーの所有権チェック」が customerId: null を読んだ直後、
        // 別リクエストが claim を完了させた状況を再現する。
        const claimResult = await claimEventRegistrationForCustomer(
          verified.registrationId,
          customer.id,
        );
        expect(claimResult.claimed).toBe(true);

        // ローカル Windows + docker-compose test-db + adapter-pg 環境限定の既知の
        // タイミング事象対策（cancel-by-token-roundtrip.test.ts の「逐次二重 cancel」
        // と同じ注記）: 直前テストの interactive transaction 完了直後に同一プロセスから
        // 次の $transaction を発行すると driver adapter 側のスロット解放待ちで
        // "Unable to start a transaction in the given time" になることがある。
        await new Promise((resolve) => setTimeout(resolve, 100));

        // 事前チェック時点の期待値（null）のまま cancel を試みる → atomic UPDATE の
        // WHERE (customerId: null) が今の実データ（customer.id）とヒットせず、
        // count=0 で CONFLICT として弾かれるはず。
        await expect(
          cancelEventRegistrationByToken(verified.registrationId, null),
        ).rejects.toThrow(/別の操作/);

        const updated = await prisma.eventRegistration.findUnique({
          where: { id: registrationId },
          select: { status: true, customerId: true },
        });
        expect(updated?.status).toBe(RegistrationStatus.CONFIRMED);
        expect(updated?.customerId).toBe(customer.id);
      } finally {
        await cleanup();
        await prisma.customer.deleteMany({ where: { id: customer.id } });
      }
    }, 30_000);

    test("逐次二重 cancel: 2 回目は DomainError(CONFLICT) で弾かれる", async () => {
      const { registrationId, cleanup } = await createRegistration(futureEvent);

      try {
        const expiresAt = computeCancelTokenExpiresAt(FUTURE_SLOT_START);
        const token = createCancelToken(registrationId, expiresAt);
        const verified = verifyCancelToken(token, new Date());
        if (!verified.valid)
          throw new Error("token verify failed unexpectedly");

        const first = await cancelEventRegistrationByToken(
          verified.registrationId,
        );
        expect(first.id).toBe(registrationId);

        // ローカル Windows + docker-compose test-db + adapter-pg 環境限定の既知の
        // タイミング事象: 直前の interactive transaction が完全に片付く前に同一
        // プロセスから次の `$transaction` を即座に発行すると、driver adapter 側の
        // トランザクションスロット解放が間に合わず `Transaction API error:
        // Unable to start a transaction in the given time` になることを実測した
        // （実プロダクトのバグではなく、実際の HTTP リクエストには往復遅延がある
        // ため本番では起きない。per-registration rate limit で連打も別途抑制する）。
        await new Promise((resolve) => setTimeout(resolve, 100));

        await expect(
          cancelEventRegistrationByToken(verified.registrationId),
        ).rejects.toThrow(/キャンセルできません|ステータスが変更/);

        const updated = await prisma.eventRegistration.findUnique({
          where: { id: registrationId },
          select: { status: true },
        });
        expect(updated?.status).toBe(RegistrationStatus.CANCELLED);
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("並行二重 cancel: 5 並行 cancelEventRegistrationByToken でも CANCELLED は確実に 1 回だけ", async () => {
      const { registrationId, cleanup } = await createRegistration(futureEvent);

      try {
        const expiresAt = computeCancelTokenExpiresAt(FUTURE_SLOT_START);
        const token = createCancelToken(registrationId, expiresAt);
        const verified = verifyCancelToken(token, new Date());
        if (!verified.valid)
          throw new Error("token verify failed unexpectedly");

        const results = await Promise.allSettled(
          Array.from({ length: 5 }, () =>
            cancelEventRegistrationByToken(verified.registrationId),
          ),
        );

        const winners = results.filter((r) => r.status === "fulfilled");
        expect(winners.length).toBe(1);

        const updated = await prisma.eventRegistration.findUnique({
          where: { id: registrationId },
          select: { status: true },
        });
        expect(updated?.status).toBe(RegistrationStatus.CANCELLED);
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("開催後（スロット開始時刻を過ぎた exp）のトークンは expired", async () => {
      const { registrationId, cleanup } = await createRegistration(pastEvent);

      try {
        const expiresAt = computeCancelTokenExpiresAt(PAST_SLOT_START);
        const token = createCancelToken(registrationId, expiresAt);
        const verified = verifyCancelToken(token, new Date());
        expect(verified).toEqual({ valid: false, reason: "expired" });

        const updated = await prisma.eventRegistration.findUnique({
          where: { id: registrationId },
          select: { status: true },
        });
        expect(updated?.status).toBe(RegistrationStatus.CONFIRMED);
      } finally {
        await cleanup();
      }
    }, 30_000);
  },
);
