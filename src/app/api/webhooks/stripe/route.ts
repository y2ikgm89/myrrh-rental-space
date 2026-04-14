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
 * ## べき等性
 * 各ハンドラーは処理前に現在の paymentStatus をチェックし、
 * 既に処理済みの場合はスキップする（Webhook の重複配信対策）
 *
 * @see https://docs.stripe.com/payments/checkout/fulfill-orders
 * @module api/webhooks/stripe
 */

import type Stripe from "stripe";
import { revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  getReservationPaymentStatus,
  updateReservationPaymentCompleted,
  savePaymentIntentId,
  markReservationPaymentFailed,
  findReservationByPaymentIntent,
  markReservationRefunded,
} from "@/shared/domain/reservations/payment-queries";
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from "@/shared/lib/constants";
import { safeDecrypt } from "@/shared/lib/crypto";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import { sendReservationConfirmationEmail } from "@/shared/lib/email/reservation-emails";
import { getStripeSettings } from "@/shared/domain/settings/queries/integration";
import { getStripeClient } from "@/app/(admin)/admin/(dashboard)/_shared/lib/stripe";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { omitUndefined } from "@/shared/lib/serialize";

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
    const webhookSecret = safeDecrypt(settings.stripeWebhookSecret);
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
      event = client.webhooks.constructEvent(body, signature, webhookSecret);
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
    // エラーでも 200 を返す（Stripe が再送しないように）
    return jsonSuccess({ error: "Webhook processing failed" });
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
 */
function invalidateReservationCache(reservationId: string): void {
  revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA);
  revalidateTag(
    getCacheTag.reservations.detail(reservationId),
    CACHE_LIFE.DYNAMIC_DATA,
  );
  revalidateTag(getCacheTag.reservations.calendar(), CACHE_LIFE.DYNAMIC_DATA);
}

/**
 * 決済完了後の確認メール送信 + キャッシュ無効化
 */
async function fulfillPayment(
  reservationId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  const reservation = await updateReservationPaymentCompleted(reservationId, {
    stripePaymentIntentId: paymentIntentId,
  });

  invalidateReservationCache(reservationId);

  // 確認メールを非同期送信
  fireAndForget(
    sendReservationConfirmationEmail(
      omitUndefined({
        reservationId: reservation.id,
        customerEmail: reservation.customer.email,
        customerName: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
        spaceName: reservation.space.name,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        totalPrice: reservation.totalPrice,
        location: reservation.space.location?.name,
        notes: reservation.notes ?? undefined,
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

  // べき等性チェック: 既に PAID なら重複処理をスキップ
  const current = await getReservationPaymentStatus(reservationId);
  if (current?.paymentStatus === PaymentStatus.PAID) return;

  if (session.payment_status === "paid") {
    // 即時決済（カード等）: すぐに fulfill
    await fulfillPayment(reservationId, session);
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

  // べき等性チェック
  const current = await getReservationPaymentStatus(reservationId);
  if (current?.paymentStatus === PaymentStatus.PAID) return;

  await fulfillPayment(reservationId, session);
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

  // べき等性チェック
  const current = await getReservationPaymentStatus(reservationId);
  if (
    current?.paymentStatus === PaymentStatus.FAILED ||
    current?.paymentStatus === PaymentStatus.PAID
  )
    return;

  await markReservationPaymentFailed(reservationId);
  invalidateReservationCache(reservationId);
}

/**
 * checkout.session.expired
 *
 * Checkout Session の有効期限切れ。paymentStatus → FAILED。
 */
async function handleCheckoutSessionExpired(session: Stripe.Checkout.Session) {
  const reservationId = extractReservationId(
    session,
    "stripeWebhookCheckoutExpired",
  );
  if (!reservationId) return;

  // べき等性チェック: PAID / REFUNDED なら expire しない
  const current = await getReservationPaymentStatus(reservationId);
  if (
    current?.paymentStatus === PaymentStatus.PAID ||
    current?.paymentStatus === PaymentStatus.REFUNDED
  )
    return;

  await markReservationPaymentFailed(reservationId);
  invalidateReservationCache(reservationId);
}

/**
 * charge.refunded
 *
 * 返金完了。stripePaymentIntentId で予約を検索し REFUNDED に更新。
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

  // べき等性チェック: 既に REFUNDED なら skip
  if (reservation.paymentStatus === PaymentStatus.REFUNDED) return;

  await markReservationRefunded(reservation.id);
  invalidateReservationCache(reservation.id);
}
