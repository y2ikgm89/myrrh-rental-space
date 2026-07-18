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
 * - `"duplicate"`: 既に別配送で受領済み。呼出側は副作用ゼロで 200 短絡する。
 *
 * `create` の P2002 unique conflict を duplicate 判定に使うことで、SELECT+INSERT
 * の TOCTOU race を回避する (真の atomic な chokepoint になる)。
 *
 * ## crash-recovery
 * このテーブルは「受領済みマーカー」で、`processedAt` が null のまま残る row
 * (mid-flight or crash) の recovery は既存 handler 側の updateMany claim guard
 * (`claimReservationAsPaid` 等の paymentStatus/status WHERE) が backstop 責任を
 * 持つ。Stripe が retry すると本関数は `"duplicate"` を返すため、初回 crash 後の
 * 再配送は claim 経路に届かず stuck するかのように見えるが、実際には以下:
 *
 *   1. 初回配送: claim 前に crash → StripeEvent 行だけ残る (processedAt null)
 *   2. Stripe retry: 本関数が duplicate 判定 → 200 短絡 (claim 実行されず)
 *   3. → paymentStatus が UNPAID/PENDING のまま stuck
 *
 * この 3 が問題になるため、STRIPE-DEDUP-B (別 PR) で
 * `/api/cron/stripe-event-cleanup` に「processedAt=null かつ receivedAt < now - 1h
 * の event 行を削除する reconcile 経路」を追加し、再配送を allow する。
 * (retention 90 日削除と同じ cron に統合。同期問題は operational monitoring で拾う)
 */
export type StripeEventClaimResult = "claimed" | "duplicate";

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
      return "duplicate";
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
