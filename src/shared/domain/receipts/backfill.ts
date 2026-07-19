import "server-only";

import { prisma } from "@/shared/db/prisma";
import { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import {
  issueReceiptForReservation,
  issueReceiptForEventRegistration,
} from "./issue";

/**
 * 既存 PAID / PARTIALLY_REFUNDED 予約・イベント申込の Receipt 未発行分をバッチ発行する。
 *
 * ## カバレッジ (2 系統の orphan を同一 query で reconcile)
 * 1. **Historical orphans** — receipt PR#1-#4 の webhook 経由自動発行が配線される前
 *    (2026-07-15 以前) に確定した PAID 予約は Receipt が発行されていない。この cron で
 *    後追い発行する (Foundation gap analysis task #7 receipt-full-wiring PR#7 の当初目的)。
 * 2. **STRIPE-03 mitigation — webhook-retry-stuck orphans** — Stripe webhook の
 *    `fulfillPaymentAtomically` / `fulfillEventRegistrationPaymentAtomically` は
 *    `claimReservationAsPaid` (or event 側の対称関数) を **先に** 呼んで
 *    paymentStatus=PAID に flip し、その後で `issueReceiptForReservation` を await する。
 *    issueReceipt が transient DB 障害等で throw すると webhook は 500 を返し Stripe が
 *    retry するが、retry 時は `claim*` が「既に PAID (count=0)」を検知して null を返し
 *    早期 return するため、issueReceipt は二度と呼ばれず PAID + Receipt 無しの
 *    orphan が焼き付く。この cron が `paymentStatus IN [PAID, PARTIALLY_REFUNDED] AND
 *    receipt: null` を毎時走査して発行を再試行することで backstop する。
 *
 * ## 冪等契約
 * `issueReceiptFor{Reservation,EventRegistration}` は
 * `@unique(reservationId)` / `@unique(eventRegistrationId)` + advisory lock 728353 で
 * at-least-once 呼出でも重複発行なし。**webhook と cron が同時に走った場合も同 lock で
 * serialize されるため double-issue しない**。VALIDATION エラー (金額 0 / paymentStatus
 * mismatch 等) は業務的にスキップし error にカウントしない (再送しても解消しない、
 * 次回 cron でも再スキップ)。
 *
 * @param options.limit reservation / eventRegistration それぞれの最大処理件数 (default 100)。
 *   cron の 1 回起動あたりの上限。上限に達した場合は次回 cron 起動で残りが処理される
 *   (古い順に処理するため FIFO 進捗)。
 * @returns バッチ結果サマリ (issued / skipped / errors / processed*)
 */
export async function backfillReceipts(options?: {
  readonly limit?: number;
}): Promise<{
  readonly issuedReservations: number;
  readonly skippedReservations: number;
  readonly errorReservations: number;
  readonly issuedEventRegistrations: number;
  readonly skippedEventRegistrations: number;
  readonly errorEventRegistrations: number;
}> {
  const limit = options?.limit ?? 100;

  // Reservation: paidAmount 相当 (totalPriceWithTax > 0) + Receipt 未発行
  // (relation filter `receipt: null` は Prisma 上 1-to-0..1 relation で使える)
  const reservationRows = await prisma.reservation.findMany({
    where: {
      paymentStatus: {
        in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
      },
      receipt: null,
      deletedAt: null,
      totalPriceWithTax: { gt: 0 },
    },
    select: { id: true },
    orderBy: { paidAt: "asc" }, // 古い順に処理
    take: limit,
  });

  let issuedReservations = 0;
  let skippedReservations = 0;
  let errorReservations = 0;

  for (const row of reservationRows) {
    try {
      // OBS-02: source="backfill-cron" を AuditLog metadata に載せて webhook 経路と区別。
      await issueReceiptForReservation(row.id, { source: "backfill-cron" });
      issuedReservations++;
    } catch (error) {
      if (error instanceof DomainError && error.code === "VALIDATION") {
        skippedReservations++;
      } else {
        errorReservations++;
        logError(error instanceof Error ? error : new Error(String(error)), {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "backfillReceipts.reservation",
            reservationId: row.id,
          },
        });
      }
    }
  }

  // EventRegistration: paidAmount > 0 + Receipt 未発行
  const registrationRows = await prisma.eventRegistration.findMany({
    where: {
      paymentStatus: {
        in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
      },
      receipt: null,
      paidAmount: { gt: 0 },
      event: { deletedAt: null },
    },
    select: { id: true },
    orderBy: { paidAt: "asc" },
    take: limit,
  });

  let issuedEventRegistrations = 0;
  let skippedEventRegistrations = 0;
  let errorEventRegistrations = 0;

  for (const row of registrationRows) {
    try {
      // OBS-02: source="backfill-cron" を AuditLog metadata に載せる (対称化)。
      await issueReceiptForEventRegistration(row.id, {
        source: "backfill-cron",
      });
      issuedEventRegistrations++;
    } catch (error) {
      if (error instanceof DomainError && error.code === "VALIDATION") {
        skippedEventRegistrations++;
      } else {
        errorEventRegistrations++;
        logError(error instanceof Error ? error : new Error(String(error)), {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "backfillReceipts.eventRegistration",
            registrationId: row.id,
          },
        });
      }
    }
  }

  return {
    issuedReservations,
    skippedReservations,
    errorReservations,
    issuedEventRegistrations,
    skippedEventRegistrations,
    errorEventRegistrations,
  };
}
