import "server-only";

import { PaymentStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { getStripeClient } from "@/shared/lib/stripe";
import { getStripeSettings } from "@/shared/domain/settings/queries/integration";
import { getAppUrl } from "@/shared/lib/constants";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** JPY など小数点なし通貨（unit_amount がそのまま最小単位） */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "jpy",
  "krw",
  "vnd",
  "bif",
  "clp",
  "djf",
  "gnf",
  "kmf",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "xaf",
  "xof",
  "xpf",
]);

/**
 * 通貨に応じた Stripe unit_amount を計算
 * JPY 等のゼロ小数点通貨はそのまま、それ以外は 100 倍
 */
function toStripeUnitAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
    ? amount
    : Math.round(amount * 100);
}

// ---------------------------------------------------------------------------
// Checkout Session
// ---------------------------------------------------------------------------

export async function createCheckoutSessionCommand(reservationId: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId, deletedAt: null },
    select: {
      id: true,
      customerId: true,
      totalPrice: true,
      paymentStatus: true,
      stripeCheckoutSessionId: true,
      space: { select: { name: true } },
      customer: { select: { email: true, lastName: true, firstName: true } },
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  if (reservation.paymentStatus !== PaymentStatus.UNPAID) {
    throw new DomainError(
      "この予約は既に決済処理が開始されています",
      "VALIDATION",
    );
  }

  if (reservation.totalPrice === null || reservation.totalPrice <= 0) {
    throw new DomainError(
      "料金が設定されていない予約は決済できません",
      "VALIDATION",
    );
  }

  const stripeSettings = await getStripeSettings();
  if (!stripeSettings?.stripeEnabled) {
    throw new DomainError("Stripe 決済が有効になっていません", "VALIDATION");
  }

  const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const currency = stripeSettings.stripeCurrency ?? "jpy";
  const appUrl = getAppUrl();

  try {
    const session = await client.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `予約: ${reservation.space.name}`,
            },
            unit_amount: toStripeUnitAmount(reservation.totalPrice, currency),
          },
          quantity: 1,
        },
      ],
      metadata: {
        reservationId,
      },
      customer_email: reservation.customer.email,
      success_url: `${appUrl}/mypage/reservations/${reservationId}?payment=success`,
      cancel_url: `${appUrl}/mypage/reservations/${reservationId}?payment=cancelled`,
    });

    await prisma.reservation.update({
      where: { id: reservationId, deletedAt: null },
      data: {
        paymentStatus: PaymentStatus.PENDING,
        stripeCheckoutSessionId: session.id,
      },
    });

    return {
      sessionId: session.id,
      sessionUrl: session.url,
      customerId: reservation.customerId,
    };
  } catch (error) {
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "createCheckoutSession", reservationId },
    });
    throw new DomainError(
      "決済セッションの作成に失敗しました。しばらく経ってからお試しください。",
      "UNEXPECTED",
    );
  }
}

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------

export async function refundReservationPaymentCommand(reservationId: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId, deletedAt: null },
    select: {
      id: true,
      customerId: true,
      paymentStatus: true,
      stripePaymentIntentId: true,
      totalPrice: true,
    },
  });

  if (!reservation) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }

  if (reservation.paymentStatus !== PaymentStatus.PAID) {
    throw new DomainError("支払い済みの予約のみ返金できます", "VALIDATION");
  }

  if (!reservation.stripePaymentIntentId) {
    throw new DomainError("Stripe の決済情報が見つかりません", "VALIDATION");
  }

  const stripeSettings = await getStripeSettings();
  if (!stripeSettings?.stripeEnabled) {
    throw new DomainError("Stripe 決済が有効になっていません", "VALIDATION");
  }

  const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  try {
    const refund = await client.refunds.create({
      payment_intent: reservation.stripePaymentIntentId,
    });

    await prisma.reservation.update({
      where: { id: reservationId, deletedAt: null },
      data: {
        paymentStatus: PaymentStatus.REFUNDED,
      },
    });

    return {
      refundId: refund.id,
      status: refund.status,
      customerId: reservation.customerId,
    };
  } catch (error) {
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "refundReservationPayment", reservationId },
    });
    throw new DomainError(
      "返金処理に失敗しました。しばらく経ってからお試しください。",
      "UNEXPECTED",
    );
  }
}
