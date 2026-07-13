/**
 * Stripe Webhook API
 *
 * Stripe からの Webhook イベントを受信し、
 * 予約の決済ステータスを更新します。
 *
 * ## 処理イベント（Stripe 公式推奨の Checkout フルセット）
 * - checkout.session.completed: セッション完了（即時決済 → PAID / 非同期決済 → PENDING 維持）
 * - checkout.session.async_payment_succeeded: 非同期決済成功 → PAID
 * - checkout.session.async_payment_failed: 非同期決済失敗 → FAILED
 * - checkout.session.expired: セッション期限切れ → FAILED
 * - charge.refunded: 返金完了 → REFUNDED
 *
 * ## べき等性（atomic claim）
 * 各 handler は `claimReservationAs*` の **WHERE 条件で paymentStatus を排他制御**する
 * 単一 UPDATE で状態遷移する。`findUnique → update` の 2 ステップでは race window
 * が残り、`session.completed` と `async_payment_succeeded` の並行配信で確認メールが
 * 二重送信される silent bug を起こすため、claim 成否（`updateMany.count > 0`）で
 * 後続副作用（メール送信 / cache invalidate）を gate する。
 *
 * @see https://docs.stripe.com/payments/checkout/fulfill-orders
 * @module api/webhooks/stripe
 */

import type Stripe from "stripe";
import { unstable_rethrow } from "next/navigation";
import {
  claimReservationAsPaid,
  claimReservationAsFailed,
  claimReservationAsRefunded,
  savePaymentIntentId,
  findReservationByPaymentIntent,
} from "@/shared/domain/reservations/payment-queries";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { safeDecryptToString } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import { sendReservationConfirmationEmail } from "@/shared/lib/email/reservation-emails";
import { getStripeSettings } from "@/shared/domain/settings/queries/integration";
import { getStripeClient } from "@/shared/lib/stripe";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { omitUndefined } from "@/shared/lib/serialize";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

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

    // 2. Stripe 設定を取得
    const settings = await getStripeSettings();
    if (!settings?.stripeEnabled || !settings.stripeWebhookSecret) {
      logError(new Error("Stripe webhook not configured"), {
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
    const { client } = await getStripeClient(settings.stripeSecretKey);
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

    // 5. イベント処理（Stripe 公式推奨の Checkout フルセット）
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case "checkout.session.async_payment_succeeded":
        await handleAsyncPaymentSucceeded(event.data.object);
        break;

      case "checkout.session.async_payment_failed":
        await handleAsyncPaymentFailed(event.data.object);
        break;

      case "checkout.session.expired":
        await handleCheckoutSessionExpired(event.data.object);
        break;

      case "charge.refunded":
        await handleChargeRefunded(event.data.object);
        break;

      default:
        // 未対応イベントは無視（200 を返す）
        break;
    }

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

// =============================================================================
// Helpers
// =============================================================================

/**
 * Checkout Session から reservationId を取得（共通バリデーション）
 */
function extractReservationId(
  session: Stripe.Checkout.Session,
  operation: string,
): string | null {
  const reservationId = session.metadata?.["reservationId"];
  if (!reservationId) {
    logError(new Error("Missing reservationId in session metadata"), {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context: { operation, sessionId: session.id },
    });
    return null;
  }
  return reservationId;
}

/**
 * 予約キャッシュを無効化（共通）
 *
 * webhook では `revalidateTag(tag, CACHE_LIFE.DYNAMIC_DATA)` の SWR ではなく
 * `invalidateSiteWideCacheFromRouteHandler` 経由の `{expire:0}` を使う。
 * Stripe 公式 fulfillment ガイドラインに沿った即時反映のため。
 * @see https://docs.stripe.com/payments/checkout/fulfill-orders
 */
function invalidateReservationCache(reservationId: string): void {
  // skipCdnPurge: true — RESERVATIONS + detail + calendar は全て admin-only の
  // private tag (NEXTJS_TAGS_WITHOUT_CDN_MAPPING allowlist)。CDN 経路に emit されない
  // ため、SITEMAP co-purge を Cloudflare に飛ばす意味が無く、purge quota を
  // 不必要に消費する (Codex PR #945 review 対応)。
  invalidateSiteWideCacheFromRouteHandler(
    [
      CACHE_TAGS.RESERVATIONS,
      getCacheTag.reservations.detail(reservationId),
      getCacheTag.reservations.calendar(),
    ],
    { skipCdnPurge: true },
  );
}

/**
 * 決済完了の atomic claim + 確認メール + cache invalidation。
 *
 * `claimReservationAsPaid` が `null` を返した場合（既に PAID / 重複配信）は
 * 後続副作用を一切実行しない（メール二重送信防止）。
 */
async function fulfillPaymentAtomically(
  reservationId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  const reservation = await claimReservationAsPaid(reservationId, {
    stripePaymentIntentId: paymentIntentId,
  });

  // claim 失敗（既に PAID / 予約不在）→ 副作用 skip
  if (!reservation) return;

  invalidateReservationCache(reservationId);

  if (reservation.status === ReservationStatus.CONFIRMED) return;

  fireAndForget(
    sendReservationConfirmationEmail(
      omitUndefined({
        reservationId: reservation.id,
        customerEmail: reservation.guestEmail ?? reservation.customer.email,
        customerName: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
        spaceName: reservation.space.name,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        totalPrice: reservation.totalPrice,
        location: reservation.space.location?.name,
        notes: reservation.notes ?? undefined,
        icsSequence: reservation.icsSequence,
        userId: reservation.userId,
      }),
    ),
    {
      operation: "sendPaymentConfirmationEmail",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { reservationId },
    },
  );
}

// =============================================================================
// Event Handlers
// =============================================================================

/**
 * checkout.session.completed
 *
 * Stripe 公式: session.payment_status を確認する。
 * - "paid": 即時決済（カード等）→ 即座に fulfill
 * - "unpaid": 非同期決済（銀行振込等）→ async_payment_succeeded を待つ
 *
 * @see https://docs.stripe.com/payments/checkout/fulfill-orders
 */
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  const reservationId = extractReservationId(
    session,
    "stripeWebhookCheckoutCompleted",
  );
  if (!reservationId) return;

  if (session.payment_status === "paid") {
    // 即時決済（カード等）: atomic claim で fulfill
    await fulfillPaymentAtomically(reservationId, session);
  } else {
    // 非同期決済（銀行振込等）: PaymentIntent ID のみ保存
    // paymentStatus は PENDING のまま維持。async_payment_succeeded で fulfill される
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : null;

    if (paymentIntentId) {
      await savePaymentIntentId(reservationId, paymentIntentId);
    }

    invalidateReservationCache(reservationId);
  }
}

/**
 * checkout.session.async_payment_succeeded
 *
 * 銀行振込等の非同期決済が成功した場合に発火。
 * checkout.session.completed で "unpaid" だった予約を fulfill する。
 */
async function handleAsyncPaymentSucceeded(session: Stripe.Checkout.Session) {
  const reservationId = extractReservationId(
    session,
    "stripeWebhookAsyncPaymentSucceeded",
  );
  if (!reservationId) return;

  await fulfillPaymentAtomically(reservationId, session);
}

/**
 * checkout.session.async_payment_failed
 *
 * 非同期決済が失敗した場合に発火。
 */
async function handleAsyncPaymentFailed(session: Stripe.Checkout.Session) {
  const reservationId = extractReservationId(
    session,
    "stripeWebhookAsyncPaymentFailed",
  );
  if (!reservationId) return;

  // session.id を渡して stale webhook が別 session の PENDING を巻き込むのを封殺
  // (Codex PR #1043 P1: FAILED→PENDING re-checkout race)。
  const claimed = await claimReservationAsFailed(reservationId, session.id);
  if (claimed) {
    invalidateReservationCache(reservationId);
  }
}

/**
 * checkout.session.expired
 *
 * Checkout Session の有効期限切れ。paymentStatus → FAILED。
 * PAID / REFUNDED 済みは `claimReservationAsFailed` 内で skip される。
 */
async function handleCheckoutSessionExpired(session: Stripe.Checkout.Session) {
  const reservationId = extractReservationId(
    session,
    "stripeWebhookCheckoutExpired",
  );
  if (!reservationId) return;

  // session.id を渡して stale webhook が別 session の PENDING を巻き込むのを封殺
  // (Codex PR #1043 P1: FAILED→PENDING re-checkout race)。
  const claimed = await claimReservationAsFailed(reservationId, session.id);
  if (claimed) {
    invalidateReservationCache(reservationId);
  }
}

/**
 * charge.refunded
 *
 * 返金完了。stripePaymentIntentId で予約を検索し REFUNDED に atomic claim。
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : null;

  if (!paymentIntentId) {
    logError(new Error("Missing payment_intent on charge.refunded event"), {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "stripeWebhookChargeRefunded",
        chargeId: charge.id,
      },
    });
    return;
  }

  const reservation = await findReservationByPaymentIntent(paymentIntentId);

  if (!reservation) {
    logError(
      new Error("No reservation found for payment_intent on charge.refunded"),
      {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "stripeWebhookChargeRefunded",
          paymentIntentId,
        },
      },
    );
    return;
  }

  const claimed = await claimReservationAsRefunded(reservation.id);
  if (claimed) {
    invalidateReservationCache(reservation.id);
  }
}
