import "server-only";

import type Stripe from "stripe";
import { refundCheckoutAmountMismatchForReservation } from "@/shared/domain/reservations/payment-commands";
import { refundCheckoutAmountMismatchForEventRegistration } from "@/shared/domain/events/payment-commands";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { prisma } from "@/shared/db/prisma";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";
import {
  fromStripeUnitAmount,
  toStripeUnitAmount,
} from "@/shared/lib/stripe-shared";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import {
  invalidateEventRegistrationCache,
  invalidateReservationCache,
} from "./cache-invalidation";
import type { PaymentSubject } from "./types";

/**
 * Checkout Session から決済対象（予約 or イベント申込）を判別する。
 *
 * - reservation は `metadata.reservationId` のみで判定される既存契約
 *   （`createCheckoutSessionCommand` 参照、`type` フィールドは付与されない）
 * - event-registration は `metadata.type === "event-registration"` +
 *   `metadata.registrationId` で判定する（`createEventCheckoutSessionCommand` /
 *   `createWaitlistOfferCheckoutSessionCommand` 参照）
 *
 * どちらにも合致しない場合は **throw せず null を返す**。未知/欠損 metadata で
 * 500 を返すと Stripe が exponential backoff で再送し続ける無限リトライになる
 * ため、呼び出し側は log のみで skip し 200 を返す。
 */
export function extractPaymentSubject(
  session: Stripe.Checkout.Session,
  operation: string,
): PaymentSubject | null {
  const metadata = session.metadata;

  if (metadata?.["type"] === "event-registration") {
    const registrationId = metadata["registrationId"];
    if (!registrationId) {
      logError(
        new Error(
          "Missing registrationId in session metadata (type=event-registration)",
        ),
        {
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.MEDIUM,
          context: { operation, sessionId: session.id },
        },
      );
      return null;
    }
    return { kind: "event-registration", registrationId };
  }

  const reservationId = metadata?.["reservationId"];
  if (reservationId) {
    return { kind: "reservation", reservationId };
  }

  logError(
    new Error("Missing or unrecognized payment subject in session metadata"),
    {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context: { operation, sessionId: session.id },
    },
  );
  return null;
}

/**
 * Webhook payload に payment_intent が無い場合、Checkout Session を Stripe API で
 * 再取得して PaymentIntent ID を解決する。retrieve 後も無ければ throw し 5xx で
 * Stripe retry させる（silent orphan 防止）。
 */
export async function resolveCheckoutSessionPaymentIntent(
  session: Stripe.Checkout.Session,
  stripeClient: AsyncOnlyStripe,
): Promise<string> {
  const inline =
    typeof session.payment_intent === "string" ? session.payment_intent : null;
  if (inline) return inline;

  const retrieved = await stripeClient.checkout.sessions.retrieve(session.id, {
    expand: ["payment_intent"],
  });
  const expanded = retrieved.payment_intent;
  if (typeof expanded === "string") return expanded;
  if (expanded && typeof expanded === "object" && "id" in expanded) {
    return expanded.id;
  }

  throw new Error(
    `Checkout session ${session.id} lacks payment_intent after retrieve`,
  );
}

export function sessionHasCapturedPayment(
  session: Stripe.Checkout.Session,
): boolean {
  return (
    session.payment_status === "paid" &&
    session.amount_total != null &&
    session.amount_total > 0
  );
}

// 通知は fireAndForget で発火するのみで、この関数自身は待ち合わせない
// （返金フローを通知送信の遅延でブロックしないための意図的な fire-and-forget。
// fireAndForget 内部の async IIFE が実際の await を保持する）。そのため同期処理で
// 完結し async ではない。
function notifyAmountMismatchAutoRefund(input: {
  subject: PaymentSubject;
  refundAmount: number;
  refundId?: string;
}): void {
  const { subject, refundAmount, refundId } = input;
  if (subject.kind === "reservation") {
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.RESERVATION_REFUND,
        title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_REFUND],
        message: `予約 ${subject.reservationId} の Checkout 金額不一致を検知したため、Stripe 課金 (${refundAmount} 円) を自動返金しました`,
        resourceType: "reservation",
        resourceId: subject.reservationId,
      }),
      {
        operation: "notifyReservationAmountMismatchAutoRefund",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          reservationId: subject.reservationId,
          refundAmount,
          refundId,
        },
      },
    );
    return;
  }

  fireAndForget(
    (async () => {
      const registration = await prisma.eventRegistration.findUnique({
        where: { id: subject.registrationId },
        select: { eventId: true },
      });
      await createNotificationCommand({
        type: NOTIFICATION_TYPE.EVENT_REGISTRATION,
        title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_REGISTRATION],
        message: `イベント申込 ${subject.registrationId} の Checkout 金額不一致を検知したため、Stripe 課金 (${refundAmount} 円) を自動返金しました`,
        ...(registration
          ? {
              resourceType: "event",
              resourceId: registration.eventId,
            }
          : {}),
      });
    })(),
    {
      operation: "notifyEventRegistrationAmountMismatchAutoRefund",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        registrationId: subject.registrationId,
        refundAmount,
        refundId,
      },
    },
  );
}

export async function orchestrateCheckoutAmountMismatchRefund(
  session: Stripe.Checkout.Session,
  subject: PaymentSubject,
  expectedAppAmount: number | null,
  operation: string,
  stripeClient: AsyncOnlyStripe,
): Promise<void> {
  const subjectKey =
    subject.kind === "reservation" ? "reservationId" : "registrationId";
  const subjectId =
    subject.kind === "reservation"
      ? subject.reservationId
      : subject.registrationId;

  if (session.amount_total == null || expectedAppAmount == null) {
    logError(
      new Error(
        "Checkout session amount check skipped input — skipping fulfill (fail-closed)",
      ),
      {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.HIGH,
        context: {
          operation,
          subjectKey,
          subjectId,
          sessionId: session.id,
          sessionAmountTotal: session.amount_total,
          expectedAppAmount,
        },
      },
    );
    return;
  }

  const currency = session.currency ?? "jpy";
  const expectedUnit = toStripeUnitAmount(expectedAppAmount, currency);

  if (session.amount_total === expectedUnit) {
    return;
  }

  logError(
    new Error(
      "Checkout session amount_total mismatch — skipping fulfill (fail-closed)",
    ),
    {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.HIGH,
      context: {
        operation,
        subjectKey,
        subjectId,
        sessionId: session.id,
        sessionAmountTotal: session.amount_total,
        expectedUnit,
        expectedAppAmount,
        currency,
      },
    },
  );

  if (!sessionHasCapturedPayment(session)) {
    return;
  }

  const paymentIntentId = await resolveCheckoutSessionPaymentIntent(
    session,
    stripeClient,
  );
  const capturedAppAmount = fromStripeUnitAmount(
    session.amount_total,
    currency,
  );

  const refundResult =
    subject.kind === "reservation"
      ? await refundCheckoutAmountMismatchForReservation({
          reservationId: subject.reservationId,
          stripePaymentIntentId: paymentIntentId,
          capturedAppAmount,
        })
      : await refundCheckoutAmountMismatchForEventRegistration({
          registrationId: subject.registrationId,
          stripePaymentIntentId: paymentIntentId,
          capturedAppAmount,
        });

  if (refundResult.outcome === "refunded") {
    if (subject.kind === "reservation") {
      invalidateReservationCache(subject.reservationId);
    } else {
      invalidateEventRegistrationCache();
    }
    notifyAmountMismatchAutoRefund({
      subject,
      refundAmount: refundResult.refundAmount ?? capturedAppAmount,
      ...(refundResult.refundId !== undefined
        ? { refundId: refundResult.refundId }
        : {}),
    });
  }
}

/**
 * `session.amount_total` と DB 上の期待 charge 額を照合する (AUDIT-03)。
 *
 * mismatch 時は fulfill せず HIGH ログのみ (200 返却で Stripe retry を止める —
 * 金額改ざん / 設定 drift は再送しても解消しない poison event と同型。
 * `extractPaymentSubject` が null を返して skip する orphan パターンに揃える)。
 *
 * captured payment がある mismatch は `orchestrateCheckoutAmountMismatchRefund`
 * を先に呼ぶこと（本関数より前段）。
 *
 * `amount_total` または期待額が欠落している場合は fulfill を skip する (fail-closed)。
 *
 * 金額比較 + logError のみで構成される同期処理のため async ではない。
 */
export function checkoutSessionAmountMatchesExpected(
  session: Stripe.Checkout.Session,
  expectedAppAmount: number | null,
  operation: string,
  subjectKey: string,
  subjectId: string,
): boolean {
  if (session.amount_total == null || expectedAppAmount == null) {
    logError(
      new Error(
        "Checkout session amount check skipped input — skipping fulfill (fail-closed)",
      ),
      {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.HIGH,
        context: {
          operation,
          subjectKey,
          subjectId,
          sessionId: session.id,
          sessionAmountTotal: session.amount_total,
          expectedAppAmount,
        },
      },
    );
    return false;
  }

  const currency = session.currency ?? "jpy";
  const expectedUnit = toStripeUnitAmount(expectedAppAmount, currency);

  if (session.amount_total === expectedUnit) {
    return true;
  }

  logError(
    new Error(
      "Checkout session amount_total mismatch — skipping fulfill (fail-closed)",
    ),
    {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.HIGH,
      context: {
        operation,
        subjectKey,
        subjectId,
        sessionId: session.id,
        sessionAmountTotal: session.amount_total,
        expectedUnit,
        expectedAppAmount,
        currency,
      },
    },
  );
  return false;
}
