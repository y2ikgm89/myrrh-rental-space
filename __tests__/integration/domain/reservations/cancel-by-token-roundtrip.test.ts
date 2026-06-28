/**
 * `createCancelToken → verifyCancelToken → cancelReservationByToken` の実 Postgres
 * round-trip 統合テスト。
 *
 * **このテストが守る不変条件**:
 *   1. AES-256-GCM + HKDF + base64url の wire format が server 起動 〜 DB 反映まで
 *      壊れずに往復する（payload に焼いた `rid` で実 reservation を確実に解決できる）。
 *   2. `applyCancellation` の atomic claim（updateMany WHERE status:in）が
 *      実 Postgres 上でも race を構造的に閉じる（二重 cancel で 2 回目は count=0）。
 *   3. キャンセル経路の `cancelledByType` が `CUSTOMER_TOKEN` で確実に DB に記録される。
 *
 * **mock では拾えない理由**:
 * crypto.ts の wire format 変更や AAD/kid 仕様変更は unit test の crypto round-trip で
 * 検出できるが、「token → 実 prisma.$transaction → reservation 行への反映」までの
 * 連結を本物の Postgres で実行しないと、AAD 仕様 / payload key rename / Prisma adapter
 * 切替などの「mock を素通りする」リグレッションを deploy 後まで気付けない。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（未設定なら describe ごと skip）。
 * `registration-overbooking.test.ts` / `reminder-idempotency.test.ts` と同じ規約。
 *
 *   ローカル: TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/myrrh_test
 *           bun run test:integration
 *   CI: unit-tests job が postgres service + prisma migrate deploy 済みのため自動実行。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ReservationStatus } from "@generated/prisma/enums";

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
  typeof import("@/shared/domain/reservations/customer-commands");
type TokenModule = typeof import("@/shared/lib/reservation-cancel-token");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let cancelReservationByToken: CommandsModule["cancelReservationByToken"];
let createCancelToken: TokenModule["createCancelToken"];
let verifyCancelToken: TokenModule["verifyCancelToken"];
let computeCancelTokenExpiresAt: TokenModule["computeCancelTokenExpiresAt"];

type Fixture = {
  reservationId: string;
  startTime: Date;
  cleanup: () => Promise<void>;
};

/** Location → Space → Customer → Reservation を 1 件作る最小 fixture（reminder-idempotency と同型）。 */
async function createReservationFixture(opts?: {
  startTime?: Date;
  status?: ReservationStatus;
}): Promise<Fixture> {
  const suffix = crypto.randomUUID();
  const startTime =
    opts?.startTime ?? new Date(Date.now() + 48 * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

  const location = await prisma.location.create({
    data: {
      slug: `cancel-token-loc-${suffix}`,
      name: `Cancel Token Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `cancel-token-space-${suffix}`,
      name: `Cancel Token Space ${suffix}`,
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
      email: `cancel-token-${suffix}@example.com`,
      emailCanonical: `cancel-token-${suffix}@example.com`,
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
    },
    select: { id: true, icsSequence: true },
  });

  return {
    reservationId: reservation.id,
    startTime,
    cleanup: async () => {
      // FK 安全な順序（Space→Location は Restrict）
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

describeMaybe(
  "cancelReservationByToken — token round-trip with real Postgres",
  () => {
    beforeAll(async () => {
      ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
      ({ cancelReservationByToken } =
        await import("@/shared/domain/reservations/customer-commands"));
      ({ createCancelToken, verifyCancelToken, computeCancelTokenExpiresAt } =
        await import("@/shared/lib/reservation-cancel-token"));
      // 接続プールをウォームアップ（コールドスタートで初回クエリがブレるのを防ぐ）。
      await prisma.$queryRaw`SELECT 1`;
    });

    afterAll(async () => {
      await basePrisma.$disconnect();
    });

    test("token → verify → cancel: 予約が CANCELLED + CUSTOMER_TOKEN として永続化される", async () => {
      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h ahead
      const { reservationId, cleanup } = await createReservationFixture({
        startTime,
      });

      try {
        const expiresAt = computeCancelTokenExpiresAt(startTime, 24);
        const token = createCancelToken(reservationId, expiresAt);

        const verified = verifyCancelToken(token, new Date());
        expect(verified.valid).toBe(true);
        if (!verified.valid)
          throw new Error("token verify failed unexpectedly");
        expect(verified.reservationId).toBe(reservationId);

        const result = await cancelReservationByToken(
          verified.reservationId,
          24,
          "都合により欠席",
        );
        expect(result.success).toBe(true);

        const updated = await prisma.reservation.findUnique({
          where: { id: reservationId },
          select: {
            status: true,
            cancelledByType: true,
            cancellationReason: true,
            cancelledAt: true,
            icsSequence: true,
          },
        });
        expect(updated?.status).toBe(ReservationStatus.CANCELLED);
        expect(updated?.cancelledByType).toBe("CUSTOMER_TOKEN");
        expect(updated?.cancellationReason).toBe("都合により欠席");
        expect(updated?.cancelledAt).toBeInstanceOf(Date);
        // 初期 icsSequence=0、cancel で +1
        expect(updated?.icsSequence).toBe(1);
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("逐次二重 cancel: 2 回目は CANCELLABLE_STATUSES ガードで弾かれる（cancellationReason は最初の値を維持）", async () => {
      // 注: sequential な 2 回目の cancel は findFirst が CANCELLED 行をそのまま読むため
      // applyCancellation の早期 if (!CANCELLABLE_STATUSES.includes(...)) で弾かれる
      // （「この予約はキャンセルできません」）。WHERE 句で count=0 になる atomic claim
      // race path は「並行二重 cancel」テスト側でカバーする。
      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const { reservationId, cleanup } = await createReservationFixture({
        startTime,
      });

      try {
        const expiresAt = computeCancelTokenExpiresAt(startTime, 24);
        const token = createCancelToken(reservationId, expiresAt);
        const verified = verifyCancelToken(token, new Date());
        if (!verified.valid)
          throw new Error("token verify failed unexpectedly");

        const first = await cancelReservationByToken(
          verified.reservationId,
          24,
          "first",
        );
        expect(first.success).toBe(true);

        const second = await cancelReservationByToken(
          verified.reservationId,
          24,
          "second",
        );
        expect(second.success).toBe(false);
        if (!second.success) {
          // 逐次=ガードヒット、並行=updateMany count=0 のどちらでも 2 回目失敗を許容
          expect(second.error).toMatch(/キャンセルできません|ステータスが変更/);
        }

        // 永続化された理由は最初の "first" のまま
        const updated = await prisma.reservation.findUnique({
          where: { id: reservationId },
          select: { cancellationReason: true, status: true },
        });
        expect(updated?.cancellationReason).toBe("first");
        expect(updated?.status).toBe(ReservationStatus.CANCELLED);
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("並行二重 cancel: 5 並行 cancelReservationByToken でも CANCELLED は確実に 1 回だけ", async () => {
      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const { reservationId, cleanup } = await createReservationFixture({
        startTime,
      });

      try {
        const expiresAt = computeCancelTokenExpiresAt(startTime, 24);
        const token = createCancelToken(reservationId, expiresAt);
        const verified = verifyCancelToken(token, new Date());
        if (!verified.valid)
          throw new Error("token verify failed unexpectedly");

        const results = await Promise.all(
          Array.from({ length: 5 }, (_unused, i) =>
            cancelReservationByToken(
              verified.reservationId,
              24,
              `concurrent-${String(i)}`,
            ),
          ),
        );

        const winners = results.filter((r) => r.success === true);
        expect(winners.length).toBe(1);

        const updated = await prisma.reservation.findUnique({
          where: { id: reservationId },
          select: { status: true },
        });
        expect(updated?.status).toBe(ReservationStatus.CANCELLED);
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("policy 期限切れ予約: applyCancellation が success:false でエラー文言を返す（DB は未変更）", async () => {
      // startTime を 1 時間後にして deadlineHours=24 を渡すと policy 期限は 23 時間前=既に過去
      const startTime = new Date(Date.now() + 60 * 60 * 1000);
      const { reservationId, cleanup } = await createReservationFixture({
        startTime,
      });

      try {
        // verify 側は exp が future なら通る — つまり deadline check は applyCancellation の中で初めて落ちる
        const tokenExp = new Date(Date.now() + 30 * 60 * 1000); // 30 min ahead
        const token = createCancelToken(reservationId, tokenExp);
        const verified = verifyCancelToken(token, new Date());
        expect(verified.valid).toBe(true);
        if (!verified.valid)
          throw new Error("token verify failed unexpectedly");

        const result = await cancelReservationByToken(
          verified.reservationId,
          24,
          "deadline test",
        );
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toMatch(/キャンセル期限/);
        }

        // status は未変更
        const updated = await prisma.reservation.findUnique({
          where: { id: reservationId },
          select: { status: true },
        });
        expect(updated?.status).toBe(ReservationStatus.CONFIRMED);
      } finally {
        await cleanup();
      }
    }, 30_000);
  },
);
