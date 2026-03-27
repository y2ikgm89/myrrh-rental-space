/**
 * Stripe Webhook API
 *
 * Stripe からの Webhook イベントを受信し、
 * 予約の決済ステータスを更新します。
 *
 * ## 処理イベント
 * - checkout.session.completed: 決済完了 → PAID
 * - checkout.session.expired: セッション期限切れ → FAILED
 * - charge.refunded: 返金完了 → REFUNDED
 *
 * @module api/webhooks/stripe
 */

import type Stripe from "stripe";
import { revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import {
  updateReservationPaymentCompleted,
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
    // 1. Stripe 設定を取得
    const settings = await getStripeSettings();
    if (!settings?.stripeEnabled || !settings.stripeWebhookSecret) {
      logError(new Error("Stripe webhook not configured"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "stripeWebhook" },
      });
      return jsonError("Stripe webhook not configured", 503);
    }

    // 2. Webhook シークレットを復号
    const webhookSecret = safeDecrypt(settings.stripeWebhookSecret);
    if (!webhookSecret) {
      logError(new Error("Failed to decrypt Stripe webhook secret"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: { operation: "stripeWebhook" },
      });
      return jsonError("Stripe webhook not configured", 503);
    }

    // 3. Stripe クライアント取得
    const { client } = await getStripeClient(settings.stripeSecretKey);
    if (!client) {
      logError(new Error("Stripe client not available"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: { operation: "stripeWebhook" },
      });
      return jsonError("Stripe webhook not configured", 503);
    }

    // 4. 署名検証
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return jsonError("Missing stripe-signature header", 400);
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

    // 5. イベント処理
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object);
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
// Event Handlers
// =============================================================================

/**
 * checkout.session.completed: 決済完了
 * paymentStatus を PAID に更新し、確認メールを送信
 */
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  const reservationId = session.metadata?.["reservationId"];
  if (!reservationId) {
    logError(new Error("Missing reservationId in session metadata"), {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "stripeWebhookCheckoutCompleted",
        sessionId: session.id,
      },
    });
    return;
  }

  // payment_intent は string | PaymentIntent | null — 文字列のみ保存
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  const reservation = await updateReservationPaymentCompleted(reservationId, {
    stripePaymentIntentId: paymentIntentId,
  });

  // キャッシュ無効化
  revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA);
  revalidateTag(
    getCacheTag.reservations.detail(reservationId),
    CACHE_LIFE.DYNAMIC_DATA,
  );
  revalidateTag(getCacheTag.reservations.calendar(), CACHE_LIFE.DYNAMIC_DATA);

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

/**
 * checkout.session.expired: セッション期限切れ
 * paymentStatus を FAILED に更新
 */
async function handleCheckoutSessionExpired(session: Stripe.Checkout.Session) {
  const reservationId = session.metadata?.["reservationId"];
  if (!reservationId) {
    logError(new Error("Missing reservationId in session metadata"), {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "stripeWebhookCheckoutExpired",
        sessionId: session.id,
      },
    });
    return;
  }

  await markReservationPaymentFailed(reservationId);

  // キャッシュ無効化
  revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA);
  revalidateTag(
    getCacheTag.reservations.detail(reservationId),
    CACHE_LIFE.DYNAMIC_DATA,
  );
}

/**
 * charge.refunded: 返金完了
 * stripePaymentIntentId で予約を検索し、paymentStatus を REFUNDED に更新
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  // charge.payment_intent は string | PaymentIntent | null
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

  await markReservationRefunded(reservation.id);

  // キャッシュ無効化
  revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA);
  revalidateTag(
    getCacheTag.reservations.detail(reservation.id),
    CACHE_LIFE.DYNAMIC_DATA,
  );
}
