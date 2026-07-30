/**
 * Stripe Webhook API
 *
 * Stripe からの Webhook イベントを受信し、
 * 予約 / イベント申込（直接購入・waitlist 繰り上げ当選）の決済ステータスを更新します。
 *
 * ## 処理イベント（Stripe 公式推奨の Checkout フルセット）
 * - checkout.session.completed: セッション完了（即時決済 → PAID / 非同期決済 → PENDING 維持）
 * - checkout.session.async_payment_succeeded: 非同期決済（konbini / bank transfer 等）
 *   成功 → PAID（reservation / event-registration の直接購入・waitlist offer
 *   全経路対応 — Fix commit, レビュー Important #2 で event-registration を追加配線。
 *   waitlist offer は checkout.session.completed と同じく
 *   `confirmWaitlistOfferCommand` の容量再チェックを PAID 確定より先に通す）
 * - checkout.session.async_payment_failed: 非同期決済失敗 → FAILED
 * - checkout.session.expired: セッション期限切れ → FAILED
 * - charge.refunded: 返金完了 → REFUNDED（reservation / event-registration）
 *   waitlist 容量 race 後の自動返金は `refundExpiredWaitlistOfferPaymentCommand`
 * - refund.updated / refund.failed: konbini / customer_balance 等の非同期返金の
 *   後日確定。作成時点で status が未確定 ("pending" 等) だったため保留していた
 *   paymentStatus 反映・返金完了メール送信をここで完了させる
 *   (`handleRefundStatusUpdated`)。"failed"/"canceled" は CRITICAL ログのみ
 *   （代替返金は自動化しない、Stripe 公式ガイダンス通り管理者対応）
 *
 * ## 決済対象の判別（`extractPaymentSubject`）
 * `session.metadata` の shape で reservation / event-registration を判別する
 * （reservation は `metadata.reservationId` のみ、event-registration は
 * `metadata.type === "event-registration"` + `metadata.registrationId`）。
 * event-registration はさらに `metadata.source === "waitlist-offer"` で
 * 「waitlist 繰り上げ当選経由」か「直接購入
 * （`createEventCheckoutSessionCommand`）」かを区別する。前者のみ
 * `confirmWaitlistOfferCommand`（容量再チェック）を PAID 確定より先に呼ぶ
 * （直接購入は登録時点で既に status: CONFIRMED のため対象外）。
 *
 * ## べき等性（2 層の defense-in-depth）
 * ### (a) Primary chokepoint: `StripeEvent` unique table (STRIPE-DEDUP-A)
 * signature verification 直後に `claimStripeEventForProcessing` で
 * `event.id` を primary key として INSERT を試みる (Stripe 公式推奨パターン
 * <https://docs.stripe.com/webhooks#handle-duplicate-events>)。P2002 unique
 * conflict = 既処理なら副作用ゼロで `200 { duplicate: true }`。未処理
 * (`retry_unprocessed`) なら handler 再実行。handler 側 updateMany claim が
 * 二重副作用の backstop。
 *
 * ### (b) Backstop: 各 handler の atomic claim (`claimReservationAs*` /
 * `claimEventRegistrationAs*` の WHERE 条件で status/paymentStatus を排他制御する
 * 単一 UPDATE)。`findUnique → update` の 2 ステップでは race window が残り、
 * `session.completed` と `async_payment_succeeded` の並行配信で確認メールが
 * 二重送信される silent bug を起こすため、claim 成否 (`updateMany.count > 0`) で
 * 後続副作用（メール送信 / cache invalidate）を gate する。(a) だけでも十分に
 * 見えるが、handler crash → Stripe retry では (a) が `retry_unprocessed` で
 * handler 再入する契約。stale cleanup は補助。
 *
 * @see https://docs.stripe.com/webhooks#handle-duplicate-events
 * @see https://docs.stripe.com/payments/checkout/fulfill-orders
 * @module api/webhooks/stripe
 */

import type Stripe from "stripe";
import { unstable_rethrow } from "next/navigation";
import {
  claimStripeEventForProcessing,
  markStripeEventProcessed,
} from "@/shared/domain/stripe-events/dedup";
import { assertStripeCredentialsConfigured } from "@/shared/domain/payment/availability";
import { dispatchStripeWebhookEvent } from "@/shared/domain/payment/stripe-webhook/dispatch";
import { safeDecryptToString } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { getStripeClient } from "@/shared/lib/stripe";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

// =============================================================================
// POST /api/webhooks/stripe
// =============================================================================

export async function POST(request: Request) {
  try {
    // 1. 署名ヘッダーの早期チェック（DB アクセス前に偽造リクエストを弾く）
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return jsonError("Missing stripe-signature header", 400);
    }

    // 2. Stripe credentials gate（feature module は見ない）。
    //    既に Stripe で決済が成立した event は credentials があれば必ず受理し 2xx を返す
    //    (Stripe 公式: valid event は 2xx で retry を止める)。feature OFF は新規 checkout
    //    のみを止め、webhook settlement は継続する。
    //    credentials 欠損 / 復号失敗 / client 不可は 503（admin が credentials を復旧すれば
    //    Stripe の exponential backoff 再送で配送成功する）。
    let settings;
    try {
      settings = await assertStripeCredentialsConfigured();
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "stripeWebhook" },
      });
      return jsonError("Stripe webhook not configured", 503);
    }

    // 3. Webhook シークレットを復号
    const webhookSecret = safeDecryptToString(settings.stripeWebhookSecret, {
      expectedPurpose: SETTINGS_CRYPTO_PURPOSES.stripeWebhookSecret,
    });
    if (!webhookSecret) {
      logError(new Error("Failed to decrypt Stripe webhook secret"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: { operation: "stripeWebhook" },
      });
      return jsonError("Stripe webhook not configured", 503);
    }

    // 4. Stripe クライアント取得 + 署名検証
    const { client } = getStripeClient(settings.stripeSecretKey);
    if (!client) {
      logError(new Error("Stripe client not available"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: { operation: "stripeWebhook" },
      });
      return jsonError("Stripe webhook not configured", 503);
    }

    let event: Stripe.Event;
    try {
      // Bun runtime は WebCrypto のみで SubtleCryptoProvider (async-only) を選択するため、
      // sync 版 constructEvent は "SubtleCryptoProvider cannot be used in a synchronous context"
      // で throw する。Stripe SDK 公式の async 版を使用する。
      // 公式: https://github.com/stripe/stripe-node — "Use `await constructEventAsync(...)`"
      event = await client.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
      );
    } catch (verifyError) {
      logError(normalizeError(verifyError), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "stripeWebhookSignatureVerification" },
      });
      return jsonError("Invalid signature", 400);
    }

    // 5. Primary dedup chokepoint (STRIPE-DEDUP-A)
    //
    // Stripe 公式 "handle-duplicate-events" 推奨実装。event.id で INSERT を試み、
    // 成功済み (`already_processed`) のみ副作用ゼロで 200 短絡する。
    // crash 後の `retry_unprocessed` は handler を再実行する（handler 側の
    // updateMany claim が二重副作用の backstop。旧実装の一律 200 短絡は
    // Stripe が再送を止め、paymentStatus が永久 stuck する欠陥だった）。
    //
    // @see https://docs.stripe.com/webhooks#handle-duplicate-events
    const claimResult = await claimStripeEventForProcessing({
      eventId: event.id,
      eventType: event.type,
    });
    if (claimResult === "already_processed") {
      return jsonSuccess({ received: true, duplicate: true });
    }

    // 6. イベント処理（Stripe 公式推奨の Checkout フルセット）
    await dispatchStripeWebhookEvent(event, client);

    // 7. handler が throw せず全て走り切ったので、chokepoint 行に processedAt を刻印。
    //    途中 throw 時は catch 側の 500 return に落ちて processedAt は null のまま残る
    //    (STRIPE-DEDUP-B の retention/reconcile cron 用の crash-recovery signal)。
    await markStripeEventProcessed(event.id);

    return jsonSuccess({ received: true });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "stripeWebhook" },
    });
    // 内部例外は 500 を返して Stripe に再送させる。
    // - 冪等性は各 handler の `claimReservationAs*` atomic claim で担保済
    //   （重複 PAID/REFUNDED/FAILED は updateMany.count === 0 で副作用 skip）
    // - 200 で握り潰すと一過性の DB 障害等で予約が PAID に遷移できず silent stuck
    // - エラー詳細は body に出さず log のみ（情報漏洩防止）
    // @see https://docs.stripe.com/webhooks (5xx → exponential backoff retry up to 3 days)
    return jsonError("Webhook processing failed", 500);
  }
}
