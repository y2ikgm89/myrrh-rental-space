import "server-only";

import { PaymentStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { getStripeClient } from "@/shared/lib/stripe";
import { getStripeSettings } from "@/shared/domain/settings/queries/integration";
import { getAppUrl } from "@/shared/lib/constants";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

// Reservation の payment-commands と共通の unit_amount 通貨変換
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

function toStripeUnitAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
    ? amount
    : Math.round(amount * 100);
}

/**
 * EventRegistration の Stripe Checkout Session を作成する (PR#10)。
 *
 * Reservation 側の createCheckoutSessionCommand と同型の設計:
 * - actor assertion (IDOR 防止)
 * - claim-first (Stripe API 呼出の前に UNPAID → PENDING を atomic に確定)
 * - claim 直後に authoritative な ticket.price / 顧客情報を再読み込み
 * - Stripe 失敗時は PENDING → UNPAID revert
 * - session settle は WHERE notIn [PAID, REFUNDED] + PENDING 再 assert
 *
 * `actorCustomerId`:
 * - `null` = admin 経路 (本人性検証 bypass)
 * - `string` = 公開経路 (Better Auth Customer.id、本人の申込のみ許可)
 */
export async function createEventCheckoutSessionCommand(input: {
  registrationId: string;
  actorCustomerId: string | null;
}) {
  const { registrationId, actorCustomerId } = input;

  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      customerId: true,
      email: true,
      name: true,
      quantity: true,
      paymentStatus: true,
      stripeCheckoutSessionId: true,
      ticket: { select: { name: true, price: true } },
      event: { select: { title: true } },
    },
  });

  if (!registration) {
    throw new DomainError("イベント申込が見つかりません", "NOT_FOUND");
  }

  if (actorCustomerId !== null && actorCustomerId !== registration.customerId) {
    throw new DomainError(
      "この申込の決済を開始する権限がありません",
      "FORBIDDEN",
    );
  }

  if (registration.paymentStatus !== PaymentStatus.UNPAID) {
    throw new DomainError(
      "この申込は既に決済処理が開始されています",
      "VALIDATION",
    );
  }

  const totalAmount = registration.ticket.price * registration.quantity;
  if (totalAmount <= 0) {
    throw new DomainError("無料チケットは決済できません", "VALIDATION");
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

  // Claim-first: UNPAID → PENDING を atomic に確定 (edit との race を封鎖)
  const claimed = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      paymentStatus: PaymentStatus.UNPAID,
    },
    data: { paymentStatus: PaymentStatus.PENDING },
  });
  if (claimed.count === 0) {
    throw new DomainError(
      "この申込は別のリクエストで既に決済処理が開始されています",
      "CONFLICT",
    );
  }

  // Authoritative re-read (直前の edit を反映)
  const authoritative = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      email: true,
      name: true,
      quantity: true,
      ticket: { select: { name: true, price: true } },
      event: { select: { title: true } },
    },
  });

  if (!authoritative || authoritative.ticket.price <= 0) {
    await prisma.eventRegistration.updateMany({
      where: { id: registrationId, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.UNPAID },
    });
    throw new DomainError("チケット料金が設定されていません", "VALIDATION");
  }

  const authoritativeTotal =
    authoritative.ticket.price * authoritative.quantity;

  try {
    const session = await client.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `${authoritative.event.title} — ${authoritative.ticket.name}`,
            },
            unit_amount: toStripeUnitAmount(
              authoritative.ticket.price,
              currency,
            ),
          },
          quantity: authoritative.quantity,
        },
      ],
      metadata: {
        // webhook で「event-registration」経路を識別するための discriminator。
        // Reservation は metadata.reservationId のみで判定される既存契約なので
        // ここでは type + registrationId を明示して衝突を防ぐ。
        type: "event-registration",
        registrationId,
      },
      ...(authoritative.email ? { customer_email: authoritative.email } : {}),
      success_url: `${appUrl}/events/registrations/${registrationId}?payment=success`,
      cancel_url: `${appUrl}/events/registrations/${registrationId}?payment=cancelled`,
    });

    const settled = await prisma.eventRegistration.updateMany({
      where: {
        id: registrationId,
        paymentStatus: {
          notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED],
        },
      },
      data: {
        paymentStatus: PaymentStatus.PENDING,
        stripeCheckoutSessionId: session.id,
        paidAmount: authoritativeTotal,
      },
    });
    if (settled.count === 0) {
      // PAID/REFUNDED race — session URL は返す (webhook 冪等性に委任)
      logError(
        new Error(
          "createEventCheckoutSessionCommand: session settled skipped (already PAID/REFUNDED)",
        ),
        {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "createEventCheckoutSession",
            registrationId,
          },
        },
      );
    }

    return {
      sessionId: session.id,
      sessionUrl: session.url,
      customerId: registration.customerId,
    };
  } catch (error) {
    // Stripe 失敗時は PENDING → UNPAID revert (再試行可能に戻す)
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "createEventCheckoutSession",
        registrationId,
      },
    });
    await prisma.eventRegistration.updateMany({
      where: { id: registrationId, paymentStatus: PaymentStatus.PENDING },
      data: { paymentStatus: PaymentStatus.UNPAID },
    });
    throw new DomainError(
      "決済セッションの作成に失敗しました。しばらく経ってからお試しください。",
      "UNEXPECTED",
    );
  }
}

/**
 * EventRegistration の Stripe webhook から呼ばれる atomic PAID 遷移。
 * Reservation の claimReservationAsPaid と同型 (updateMany WHERE で claim)。
 */
export async function claimEventRegistrationAsPaid(
  registrationId: string,
  data: { stripePaymentIntentId: string | null },
): Promise<boolean> {
  const result = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING] },
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: data.stripePaymentIntentId,
      paidAt: new Date(),
    },
  });
  return result.count > 0;
}

/**
 * EventRegistration の webhook expired/failed 経路。
 * PAID / REFUNDED / FAILED は上書きしない。
 */
export async function claimEventRegistrationAsFailed(
  registrationId: string,
): Promise<boolean> {
  const result = await prisma.eventRegistration.updateMany({
    where: {
      id: registrationId,
      paymentStatus: {
        notIn: [
          PaymentStatus.PAID,
          PaymentStatus.REFUNDED,
          PaymentStatus.FAILED,
        ],
      },
    },
    data: { paymentStatus: PaymentStatus.FAILED },
  });
  return result.count > 0;
}
