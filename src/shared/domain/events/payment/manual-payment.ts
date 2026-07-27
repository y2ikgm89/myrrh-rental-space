import "server-only";

import {
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import { issueReceiptForEventRegistration } from "@/shared/domain/receipts/issue";
import { notifyReceiptIssuedForEventRegistration } from "@/shared/domain/receipts/notify-issued";
import {
  createEventRegistrationStatusToken,
  EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS,
} from "@/shared/lib/event-registration-status-token";
import {
  MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING,
  MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING,
} from "@/shared/domain/receipts/manual-payment-warnings";
import { getAppUrl } from "@/shared/lib/constants";

/**
 * 管理者による手動入金記録。UNPAID → PAID の遷移を、Stripe を経由しない支払い
 * （現金・銀行振込等）について事後記録する。claimEventRegistrationAsPaid と同じ
 * updateMany WHERE claim パターンで二重確定を防ぐ。stripeCheckoutSessionId が
 * 非 null（Stripe決済が進行中/完了）の登録は対象外とする — walk-in/proxy 作成時は
 * この値が null 固定のため対象は自然に限定される。
 *
 * claim は `claimEventRegistrationAsPaid` と同様に `status: CONFIRMED` も要求する
 * (レビュー Important #1)。cancel 経路 (registration-cancel-core.ts) は paymentStatus
 * を触らず status のみ CANCELLED に遷移させるため、paymentStatus だけで claim すると
 * CANCELLED + UNPAID な登録を PAID に格上げできてしまい、かつ `isRefundable` は
 * stripePaymentIntentId 必須のため返金導線もない「CANCELLED+PAID で戻せない」
 * 会計不整合状態を作れてしまう。
 *
 * claim 成功後は `issueReceiptForEventRegistration` を await し、成功時のみ
 * `notifyReceiptIssuedForEventRegistration` を fire-and-forget する。領収書失敗でも
 * PAID は維持し、`receiptWarning` で部分失敗を返す（reservation 手動入金と同契約）。
 */
export type ManualEventPaymentResult = {
  registrationId: string;
  /**
   * PAID は確定したが領収書発行をスキップ / 延期したときの管理者向け警告。
   */
  receiptWarning?: string;
};

function buildEventRegistrationReceiptDetailUrl(input: {
  registrationId: string;
  customerId: string | null;
}): string {
  const appUrl = getAppUrl();
  // 会員: mypage 申込詳細。ゲスト: status token 付き薄い詳細ページ。
  if (input.customerId !== null) {
    return `${appUrl}/mypage/events/${input.registrationId}`;
  }
  const token = createEventRegistrationStatusToken(
    input.registrationId,
    new Date(Date.now() + EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS),
  );
  return `${appUrl}/events/registrations/status?token=${token}`;
}

export async function recordManualEventPaymentCommand(data: {
  registrationId: string;
  amount: number;
}): Promise<ManualEventPaymentResult> {
  const existing = await prisma.eventRegistration.findUnique({
    where: { id: data.registrationId },
    select: {
      paymentStatus: true,
      stripeCheckoutSessionId: true,
      customerId: true,
      quantity: true,
      ticket: { select: { price: true } },
    },
  });
  if (!existing) {
    throw new DomainError("参加登録が見つかりません", "NOT_FOUND");
  }
  if (existing.stripeCheckoutSessionId !== null) {
    throw new DomainError(
      "この参加登録はStripe決済が進行中または完了しているため、手動入金記録できません",
      "VALIDATION",
    );
  }

  const chargeBase = existing.ticket.price * existing.quantity;
  if (chargeBase <= 0) {
    throw new DomainError("無料チケットは手動入金記録できません", "VALIDATION");
  }
  if (data.amount !== chargeBase) {
    throw new DomainError(
      `入金額は${chargeBase}円と一致する必要があります`,
      "VALIDATION",
    );
  }

  const claimed = await prisma.eventRegistration.updateMany({
    where: {
      id: data.registrationId,
      status: RegistrationStatus.CONFIRMED,
      paymentStatus: PaymentStatus.UNPAID,
    },
    data: {
      paymentStatus: PaymentStatus.PAID,
      paidAmount: data.amount,
      paidAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    throw new DomainError(
      "この参加登録はキャンセル済み、既に入金記録済み、または決済処理中のため記録できません",
      "CONFLICT",
    );
  }

  let receiptWarning: string | undefined;
  try {
    const receipt = await issueReceiptForEventRegistration(
      data.registrationId,
      {
        source: "manual-payment",
      },
    );
    const detailUrl = buildEventRegistrationReceiptDetailUrl({
      registrationId: data.registrationId,
      customerId: existing.customerId,
    });
    fireAndForget(
      notifyReceiptIssuedForEventRegistration({
        receiptId: receipt.id,
        detailUrl,
      }),
      {
        operation: "notifyReceiptIssuedForEventRegistration",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          registrationId: data.registrationId,
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
          operation: "issueReceiptForEventRegistration",
          registrationId: data.registrationId,
          source: "manual-payment",
        },
      });
      receiptWarning = MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING;
    } else {
      logError(normalizeError(error), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.CRITICAL,
        context: {
          operation: "issueReceiptForEventRegistration",
          registrationId: data.registrationId,
          source: "manual-payment",
        },
      });
      receiptWarning = MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING;
    }
  }

  return {
    registrationId: data.registrationId,
    ...(receiptWarning !== undefined ? { receiptWarning } : {}),
  };
}
