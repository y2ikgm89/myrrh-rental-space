import "server-only";

import { prisma } from "@/shared/db/prisma";
import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";

/**
 * Stripe webhook event の受領を dedup table に排他的に登録する。
 *
 * Stripe 公式 "handle-duplicate-events" 推奨パターン
 * (https://docs.stripe.com/webhooks#handle-duplicate-events) の chokepoint 実装。
 *
 * - `"claimed"`: このプロセスが event を新規に受領した。呼出側は handler 続行。
 * - `"already_processed"`: 別配送で既に handler 成功済み (`processedAt` あり)。
 *   呼出側は副作用ゼロで 200 短絡する。
 * - `"retry_unprocessed"`: 行はあるが `processedAt` が null（初回 crash / 途中 throw）。
 *   呼出側は handler を再実行する。handler 側の updateMany claim
 *   (`claimReservationAsPaid` 等) が二重副作用の backstop。
 *
 * `create` の P2002 unique conflict を入口に使い、conflict 時だけ `processedAt`
 * を読んで分岐する。SELECT+INSERT の TOCTOU で二重 insert するより安全で、かつ
 * crash 後の Stripe retry を 200 短絡で止めない。
 *
 * ## crash-recovery（旧 `"duplicate"` 一律 200 短絡の欠陥）
 * 旧実装は P2002 をすべて `"duplicate"` → 200 にしており、以下で stuck した:
 *
 *   1. 初回: claim 後に handler crash → StripeEvent 行だけ残る (processedAt null)
 *   2. Stripe retry: duplicate → 200 → Stripe は成功扱いして再送停止
 *   3. cleanup が stale 行を DELETE しても Stripe は自動再送しない
 *
 * 本実装は 2 を `"retry_unprocessed"` に変え、handler 再実行 + 成功時
 * `markStripeEventProcessed` で完結させる。stale cleanup は孤児掃除用の補助。
 */
export type StripeEventClaimResult =
  "claimed" | "already_processed" | "retry_unprocessed";

export async function claimStripeEventForProcessing(input: {
  eventId: string;
  eventType: string;
}): Promise<StripeEventClaimResult> {
  try {
    await prisma.stripeEvent.create({
      data: { id: input.eventId, type: input.eventType },
    });
    return "claimed";
  } catch (error) {
    if (isPrismaUniqueConstraintError(error, "id")) {
      const existing = await prisma.stripeEvent.findUnique({
        where: { id: input.eventId },
        select: { processedAt: true },
      });
      if (existing?.processedAt != null) {
        return "already_processed";
      }
      // 行欠落（cleanup 直後の極稀な race）や processedAt null → 再処理を許可
      return "retry_unprocessed";
    }
    throw error;
  }
}

/**
 * handler 側の全処理が成功した後に `processedAt` を確定する。
 *
 * tx 外の post-write のため、handler 途中で throw した場合は null のまま残る
 * (これが crash-recovery detection のシグナルになる)。
 */
export async function markStripeEventProcessed(eventId: string): Promise<void> {
  await prisma.stripeEvent.update({
    where: { id: eventId },
    data: { processedAt: new Date() },
  });
}
