import "server-only";

import { PaymentStatus } from "@generated/prisma/enums";

/** PAID claim (`claim*AsPaid`) が受け付ける paymentStatus。 */
export const PAYMENT_STATUSES_CLAIMABLE_FOR_PAID = [
  PaymentStatus.UNPAID,
  PaymentStatus.PENDING,
] as const;

/** Checkout create が UNPAID / FAILED から PENDING に巻き戻す再決済許容集合。 */
export const PAYMENT_STATUSES_REOPENABLE_FOR_CHECKOUT = [
  PaymentStatus.UNPAID,
  PaymentStatus.FAILED,
] as const;

/**
 * Checkout session settle 時に上書きしてはいけない終端 paymentStatus。
 * FAILED は PENDING に巻き戻して live session URL 経由の決済を成立させる。
 */
export const PAYMENT_STATUSES_TERMINAL_FOR_CHECKOUT_SETTLE = [
  PaymentStatus.PAID,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
] as const;

/** Reservation の failed claim が上書きしない paymentStatus。 */
export const PAYMENT_STATUSES_EXCLUDED_FROM_FAILED_CLAIM_RESERVATION = [
  PaymentStatus.PAID,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
  PaymentStatus.FAILED,
] as const;

/** EventRegistration の failed claim が上書きしない paymentStatus。 */
export const PAYMENT_STATUSES_EXCLUDED_FROM_FAILED_CLAIM_EVENT = [
  PaymentStatus.PAID,
  PaymentStatus.REFUNDED,
  PaymentStatus.FAILED,
] as const;

/** `charge.refunded` webhook が paymentStatus を遷移させる起点集合。 */
export const PAYMENT_STATUSES_REFUNDABLE_FOR_CHARGE_WEBHOOK = [
  PaymentStatus.PAID,
  PaymentStatus.PARTIALLY_REFUNDED,
] as const;

/** 非同期決済の PaymentIntent ID 保存が許容する paymentStatus。 */
export const PAYMENT_STATUSES_SAVE_PAYMENT_INTENT = [
  PaymentStatus.UNPAID,
  PaymentStatus.PENDING,
] as const;

export function buildPaidClaimUpdateData(input: {
  stripePaymentIntentId: string | null;
  paidAt?: Date;
}): {
  paymentStatus: typeof PaymentStatus.PAID;
  stripePaymentIntentId: string | null;
  paidAt: Date;
} {
  return {
    paymentStatus: PaymentStatus.PAID,
    stripePaymentIntentId: input.stripePaymentIntentId,
    paidAt: input.paidAt ?? new Date(),
  };
}

export function buildFailedClaimUpdateData(): {
  paymentStatus: typeof PaymentStatus.FAILED;
} {
  return { paymentStatus: PaymentStatus.FAILED };
}

export function buildCheckoutSettleUpdateData(input: {
  sessionId: string;
  extra?: Record<string, unknown>;
}): {
  paymentStatus: typeof PaymentStatus.PENDING;
  stripeCheckoutSessionId: string;
} & Record<string, unknown> {
  return {
    paymentStatus: PaymentStatus.PENDING,
    stripeCheckoutSessionId: input.sessionId,
    ...(input.extra ?? {}),
  };
}

export function resolveRefundStatusFromChargeAmounts(input: {
  chargeAmount: number;
  amountRefunded: number;
}): typeof PaymentStatus.REFUNDED | typeof PaymentStatus.PARTIALLY_REFUNDED {
  return input.amountRefunded >= input.chargeAmount
    ? PaymentStatus.REFUNDED
    : PaymentStatus.PARTIALLY_REFUNDED;
}
