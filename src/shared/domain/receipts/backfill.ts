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
 * Foundation gap analysis (2026-07-15) task #7 receipt-full-wiring PR#7 (backfill 部分)。
 * receipt PR#1-#4 で webhook 経由の自動発行を配線したが、Stripe webhook 経由の PAID 遷移
 * より前 (PR#1-2 merge 前) に確定した既存の PAID 予約は Receipt が発行されていない。
 * cron `/api/cron/receipt-backfill` で 1 日 1 回、古い順に定量ずつ発行する。
 *
 * 冪等契約: issueReceiptFor{Reservation,EventRegistration} は
 * `@unique(reservationId)` / `@unique(eventRegistrationId)` + advisory lock 728353 で
 * at-least-once 呼出でも重複発行なし。VALIDATION エラー (金額 0 / paymentStatus mismatch 等)
 * は業務的にスキップし error にカウントしない (再送しても解消しない、次回 cron でも再スキップ)。
 *
 * @param options.limit reservation / eventRegistration それぞれの最大処理件数 (default 100)
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
      await issueReceiptForReservation(row.id);
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
      await issueReceiptForEventRegistration(row.id);
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
