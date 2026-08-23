import "server-only";

import type Stripe from "stripe";
import { claimReservationAsPaid } from "@/shared/domain/reservations/payment-queries";
import { DomainError } from "@/shared/domain/domain-error";
import { issueReceiptForReservation } from "@/shared/domain/receipts/issue";
import { notifyReceiptIssuedForReservation } from "@/shared/domain/receipts/notify-issued";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { applyConfirmationSideEffects } from "@/shared/domain/reservations/confirmation-side-effects";
import { omitUndefined } from "@/shared/lib/serialize";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { invalidateReservationCache } from "./cache-invalidation";
import { buildBookingHubUrl } from "@/shared/lib/detail-hub-urls";

/**
 * 決済完了の atomic claim + 確認メール + cache invalidation。
 *
 * `claimReservationAsPaid` が `null` を返した場合（既に PAID / 重複配信）は
 * 後続副作用を一切実行しない（メール二重送信防止）。
 */
export async function fulfillReservationPaymentAtomically(
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

  // 公開予約は作成時点で status=CONFIRMED（後払い checkout）。確認メールは作成時に
  // 送済みなので二重送信を避けるが、領収書は決済確定のたびに発行する
  // （旧 early-return は receipt も飛ばし receipt-backfill 依存だった）。
  const skipConfirmationEmail =
    reservation.status === ReservationStatus.CONFIRMED;

  // 領収書 (Receipt) の atomic 採番・発行を await で実行する。
  // - fireAndForget 禁止: 失敗が webhook から見えないと Stripe 再送で確定した予約に
  //   Receipt が発行されない silent failure になる (Foundation gap analysis で確定した契約)
  // - VALIDATION エラー (金額 0 / paymentStatus mismatch 等) は業務的にスキップ (Stripe
  //   再送しても解消しないため webhook 側で握り潰し、log で監視)
  // - それ以外 (DB 一時障害 等) は rethrow して Stripe の retry (exponential backoff /
  //   最大 3 日) に委ねる。at-least-once + advisory lock 728353 で二重発行は防止済み。
  //
  // STRIPE-03 backstop: Stripe の retry でも issueReceipt が回復しない場合、初回失敗時に
  // claim* は既に成功して paymentStatus=PAID に flip 済みのため、retry の claim* は null
  // 返し早期 return → issueReceipt が二度と呼ばれず PAID + Receipt 無しで stuck する。
  // これを毎時実行の `/api/cron/receipt-backfill` (`backfillReceipts`) が
  // `paymentStatus IN [PAID, PARTIALLY_REFUNDED] AND receipt: null` 走査で reconcile する。
  //
  // 領収書の顧客通知は確認メール埋め込みではなく `notifyReceiptIssuedFor*`（発行通知メール）。
  // 発行成功時のみ送り、CONFIRMED で確認メールを skip しても通知は必ず送る（spec §7）。
  let issuedReceipt: { id: string; serialNo: string } | undefined;
  try {
    // OBS-02: source を明示指定して AuditLog CREATE の metadata に載せる
    // (webhook 経路の自動発行を hash chain 保護された証跡として区別)。
    issuedReceipt = await issueReceiptForReservation(reservation.id, {
      source: "stripe-webhook",
    });
  } catch (error) {
    if (error instanceof DomainError && error.code === "VALIDATION") {
      logError(error, {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "issueReceiptForReservation",
          reservationId: reservation.id,
        },
      });
    } else {
      throw error;
    }
  }

  if (issuedReceipt) {
    fireAndForget(
      notifyReceiptIssuedForReservation({
        receiptId: issuedReceipt.id,
        detailUrl: buildBookingHubUrl(reservation.userId, reservation.id),
      }),
      {
        operation: "notifyReceiptIssuedForReservation",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          reservationId,
          receiptId: issuedReceipt.id,
        },
      },
    );
  }

  if (skipConfirmationEmail) return;

  const confirmationPayload = omitUndefined({
    reservationId: reservation.id,
    customerEmail: reservation.guestEmail ?? reservation.customer.email,
    customerName: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
    spaceName: reservation.space.name,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    totalPrice: reservation.totalPrice,
    totalPriceWithTax: reservation.totalPriceWithTax,
    location: reservation.space.location?.name,
    notes: reservation.notes ?? undefined,
    icsSequence: reservation.icsSequence,
    userId: reservation.userId,
  });

  fireAndForget(
    applyConfirmationSideEffects({
      payload: confirmationPayload,
      spaceId: reservation.spaceId,
      channel: "customer",
    }),
    {
      operation: "applyConfirmationSideEffects",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { reservationId },
    },
  );
}
