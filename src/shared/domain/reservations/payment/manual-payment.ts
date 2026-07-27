import "server-only";

import {
  PaymentStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { retrieveCheckoutSessionStatus } from "@/shared/domain/payment/checkout-session-expiry";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import { issueReceiptForReservation } from "@/shared/domain/receipts/issue";
import { notifyReceiptIssuedForReservation } from "@/shared/domain/receipts/notify-issued";
import {
  MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING,
  MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING,
} from "@/shared/domain/receipts/manual-payment-warnings";
import {
  createStatusToken,
  STATUS_TOKEN_LIFETIME_MS,
} from "@/shared/lib/reservation-status-token";
import { getAppUrl } from "@/shared/lib/constants";

/**
 * 管理者による手動入金記録。UNPAID → PAID の遷移を、Stripe を経由しない支払い
 * （現金・銀行振込等）について事後記録する。`createCheckoutSessionCommand` と同じ
 * updateMany WHERE claim パターンで二重確定を防ぐ。`paymentStatus` が UNPAID / FAILED
 * かつ Stripe Checkout が進行中 (session status=open) でない予約のみ対象。
 * session id が残っていても expired / complete なら手動入金可（claim 時に session id を null 化）。
 *
 * claim は `status in [PENDING, CONFIRMED]` も要求する (cancel 経路は paymentStatus
 * を触らず status のみ CANCELLED に遷移させるため、paymentStatus だけで claim すると
 * CANCELLED + UNPAID な予約を PAID に格上げできてしまう)。
 *
 * 入金額は Stripe Checkout / 領収書と同じ charge base（`totalPriceWithTax` が
 * populate されていれば税込合計、未設定なら `totalPrice`）と一致することを要求する。
 * 受領額自体は Reservation 列には保存せず AuditLog metadata にのみ記録する
 * (events の method/note と同型)。
 *
 * claim 成功後は `issueReceiptForReservation` を await し、成功時のみ
 * `notifyReceiptIssuedForReservation` を fire-and-forget する。領収書失敗でも
 * PAID は維持し、`receiptWarning` で admin UI に部分失敗を返す
 * （backfill cron が orphan を救済）。
 */
export type ManualReservationPaymentResult = {
  reservationId: string;
  customerId: string;
  /**
   * PAID は確定したが領収書発行をスキップ / 延期したときの管理者向け警告。
   * MutationResult 成功ペイロードとして透過する。
   */
  receiptWarning?: string;
};

function buildReservationReceiptDetailUrl(input: {
  reservationId: string;
  userId: string | null;
}): string {
  const appUrl = getAppUrl();
  if (input.userId !== null) {
    return `${appUrl}/mypage/reservations/${input.reservationId}`;
  }
  const token = createStatusToken(
    input.reservationId,
    new Date(Date.now() + STATUS_TOKEN_LIFETIME_MS),
  );
  return `${appUrl}/reservation/status?token=${token}`;
}

async function assertManualPaymentNotBlockedByOpenCheckout(input: {
  reservationId: string;
  sessionId: string;
}): Promise<void> {
  const sessionStatus = await retrieveCheckoutSessionStatus(input.sessionId);
  if (sessionStatus === null) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }
  if (sessionStatus === "open") {
    throw new DomainError(
      "Stripe決済が進行中のため、手動入金記録できません",
      "VALIDATION",
    );
  }
}

export async function recordManualReservationPaymentCommand(data: {
  reservationId: string;
  amount: number;
}): Promise<ManualReservationPaymentResult> {
  const existing = await prisma.reservation.findUnique({
    where: { id: data.reservationId, deletedAt: null },
    select: {
      customerId: true,
      userId: true,
      paymentStatus: true,
      stripeCheckoutSessionId: true,
      totalPrice: true,
      totalPriceWithTax: true,
    },
  });
  if (!existing) {
    throw new DomainError("予約が見つかりません", "NOT_FOUND");
  }
  if (
    existing.paymentStatus !== PaymentStatus.UNPAID &&
    existing.paymentStatus !== PaymentStatus.FAILED
  ) {
    throw new DomainError(
      "この予約はキャンセル済み、既に入金記録済み、または決済処理中のため記録できません",
      "VALIDATION",
    );
  }
  if (existing.stripeCheckoutSessionId !== null) {
    await assertManualPaymentNotBlockedByOpenCheckout({
      reservationId: data.reservationId,
      sessionId: existing.stripeCheckoutSessionId,
    });
  }

  const chargeBase = existing.totalPriceWithTax ?? existing.totalPrice;
  if (chargeBase === null || chargeBase <= 0) {
    throw new DomainError(
      "料金が設定されていない予約は手動入金記録できません",
      "VALIDATION",
    );
  }
  if (data.amount !== chargeBase) {
    throw new DomainError(
      `入金額は${chargeBase}円と一致する必要があります`,
      "VALIDATION",
    );
  }

  const claimed = await prisma.reservation.updateMany({
    where: {
      id: data.reservationId,
      deletedAt: null,
      status: {
        in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
      },
      paymentStatus: {
        in: [PaymentStatus.UNPAID, PaymentStatus.FAILED],
      },
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      paidAt: new Date(),
      stripeCheckoutSessionId: null,
    },
  });
  if (claimed.count === 0) {
    throw new DomainError(
      "この予約はキャンセル済み、既に入金記録済み、または決済処理中のため記録できません",
      "CONFLICT",
    );
  }

  let receiptWarning: string | undefined;
  try {
    const receipt = await issueReceiptForReservation(data.reservationId, {
      source: "manual-payment",
    });
    const detailUrl = buildReservationReceiptDetailUrl({
      reservationId: data.reservationId,
      userId: existing.userId,
    });
    fireAndForget(
      notifyReceiptIssuedForReservation({
        receiptId: receipt.id,
        detailUrl,
      }),
      {
        operation: "notifyReceiptIssuedForReservation",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          reservationId: data.reservationId,
          receiptId: receipt.id,
        },
      },
    );
  } catch (error) {
    if (error instanceof DomainError && error.code === "VALIDATION") {
      logError(error, {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "issueReceiptForReservation",
          reservationId: data.reservationId,
          source: "manual-payment",
        },
      });
      receiptWarning = MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING;
    } else {
      logError(normalizeError(error), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.CRITICAL,
        context: {
          operation: "issueReceiptForReservation",
          reservationId: data.reservationId,
          source: "manual-payment",
        },
      });
      receiptWarning = MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING;
    }
  }

  return {
    reservationId: data.reservationId,
    customerId: existing.customerId,
    ...(receiptWarning !== undefined ? { receiptWarning } : {}),
  };
}
