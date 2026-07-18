import "server-only";

import { prisma } from "@/shared/db/prisma";

/**
 * `StripeEvent` retention 期間 (日)。
 *
 * Stripe の webhook retry 上限は 3 日 (指数バックオフで最終試行後は諦める)。
 * 90 日は監査 / 調査 / 領収書 backfill / finance reconciliation の実務窓に十分な
 * マージンで、業界標準の webhook event ログ保持期間 (30-90 日) の上限側に合わせる。
 */
export const STRIPE_EVENT_RETENTION_DAYS = 90;

/**
 * `processedAt` が null のまま stuck した StripeEvent 行を「crash-recovery 対象」と
 * みなす閾値 (分)。
 *
 * 通常の webhook handler は数百 ms で完了し `processedAt` を確定する。長引いても
 * 数秒 (DB tx + Stripe API + Receipt PDF 生成含む)。10 分は「まだ実行中の可能性が
 * ある窓」の十分な上限で、handler が crash / OOM / SIGTERM で落ちたケースを網羅
 * しつつ、極端に長い handler を巻き込むリスクを避ける保守的な値。
 *
 * 10 分経過した null 行を DELETE すると、次回 Stripe retry で `create` が
 * `duplicate` にならず `claimed` を返して handler が再実行される。Stripe の
 * retry cadence (指数、up to 3 日) 内なら自動 recovery する。
 */
export const STRIPE_EVENT_STALE_THRESHOLD_MINUTES = 10;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

export type StripeEventCleanupResult = {
  readonly retention: number;
  readonly staleUnblock: number;
};

/**
 * StripeEvent table の 2 系統掃除を実行する。
 *
 * 1. **Retention**: `receivedAt < now - 90 日` の行を DELETE。長期保持しても
 *    価値がないため単調増加を止める。
 * 2. **Stale unblock**: `processedAt IS NULL AND receivedAt < now - 10 分` の
 *    行を DELETE。handler mid-processing crash の recovery 経路
 *    (`src/shared/domain/stripe-events/dedup.ts` docstring 参照)。
 *
 * 2 つの deleteMany は独立で、間の atomicity 保証は不要 (対象行が overlap しても
 * どちらのクエリで DELETE されても結果は同じ = 削除される)。実行順は
 * retention 先で古い行を優先削除。
 */
export async function cleanupOldStripeEvents(
  now: Date,
): Promise<StripeEventCleanupResult> {
  const retentionCutoff = new Date(
    now.getTime() - STRIPE_EVENT_RETENTION_DAYS * MS_PER_DAY,
  );
  const staleCutoff = new Date(
    now.getTime() - STRIPE_EVENT_STALE_THRESHOLD_MINUTES * MS_PER_MINUTE,
  );

  const retentionResult = await prisma.stripeEvent.deleteMany({
    where: {
      receivedAt: { lt: retentionCutoff },
    },
  });

  const staleResult = await prisma.stripeEvent.deleteMany({
    where: {
      processedAt: null,
      receivedAt: { lt: staleCutoff },
    },
  });

  return {
    retention: retentionResult.count,
    staleUnblock: staleResult.count,
  };
}
