/**
 * 領収書「新規発行」通知メールの SSoT。
 *
 * 手動入金・Stripe webhook・将来のハブ経路など、発行成功後の通知はすべてここを呼ぶ。
 * CTA URL (`detailUrl`) は呼出側が組み立てる（会員 mypage / ゲスト status token 等）。
 * 本モジュールは URL を生成しない（Task 1/8 のトークン配線と責務分離）。
 *
 * ## Idempotency
 * `receipt-issued/<serialNo>`（静的）。同一 serial への再送は first-send-wins。
 * Resend 側消失後の正当な再送は admin / ゲスト再送信フローを使うこと。
 *
 * @module shared/domain/receipts/notify-issued
 */

import "server-only";

import { prisma } from "@/shared/db/prisma";
import { sendReceiptIssuedEmail } from "@/shared/domain/email/lib-dispatch";
import type { EmailResult } from "@/shared/lib/email/types";

export type NotifyReceiptIssuedResult =
  | EmailResult
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "no_recipient" }
  | { ok: false; reason: "wrong_binding" };

/**
 * 予約に紐づく領収書の新規発行通知を送る。
 *
 * @param input.receiptId - 発行済み Receipt.id
 * @param input.detailUrl - CTA 先（会員: `/mypage/reservations/{id}`、
 *   ゲスト: `/reservation/status?token=...` 等を呼出側が渡す）
 */
export async function notifyReceiptIssuedForReservation(input: {
  readonly receiptId: string;
  readonly detailUrl: string;
}): Promise<NotifyReceiptIssuedResult> {
  const receipt = await prisma.receipt.findUnique({
    where: { id: input.receiptId },
    select: {
      serialNo: true,
      recipientName: true,
      subject: true,
      amount: true,
      taxAmount: true,
      issuedAt: true,
      reservationId: true,
      eventRegistrationId: true,
      reservation: {
        select: {
          guestEmail: true,
          customer: { select: { email: true } },
        },
      },
    },
  });

  if (!receipt) {
    return { ok: false, reason: "not_found" };
  }
  if (receipt.reservationId === null || receipt.reservation === null) {
    return { ok: false, reason: "wrong_binding" };
  }

  const recipientEmail =
    receipt.reservation.guestEmail ?? receipt.reservation.customer.email;
  if (!recipientEmail) {
    return { ok: false, reason: "no_recipient" };
  }

  return sendReceiptIssuedEmail({
    recipientEmail,
    serialNo: receipt.serialNo,
    recipientName: receipt.recipientName,
    subject: receipt.subject,
    amount: receipt.amount,
    taxAmount: receipt.taxAmount,
    issuedAt: receipt.issuedAt,
    detailUrl: input.detailUrl,
  });
}

/**
 * イベント申込に紐づく領収書の新規発行通知を送る（予約側の対称）。
 *
 * `detailUrl` は呼出側が組み立てる（会員 `/mypage/events/{id}` /
 * ゲスト status token URL）。
 */
export async function notifyReceiptIssuedForEventRegistration(input: {
  readonly receiptId: string;
  readonly detailUrl: string;
}): Promise<NotifyReceiptIssuedResult> {
  const receipt = await prisma.receipt.findUnique({
    where: { id: input.receiptId },
    select: {
      serialNo: true,
      recipientName: true,
      subject: true,
      amount: true,
      taxAmount: true,
      issuedAt: true,
      reservationId: true,
      eventRegistrationId: true,
      eventRegistration: {
        select: {
          email: true,
          customer: { select: { email: true } },
        },
      },
    },
  });

  if (!receipt) {
    return { ok: false, reason: "not_found" };
  }
  if (
    receipt.eventRegistrationId === null ||
    receipt.eventRegistration === null
  ) {
    return { ok: false, reason: "wrong_binding" };
  }

  const recipientEmail =
    receipt.eventRegistration.email ??
    receipt.eventRegistration.customer?.email ??
    null;
  if (!recipientEmail) {
    return { ok: false, reason: "no_recipient" };
  }

  return sendReceiptIssuedEmail({
    recipientEmail,
    serialNo: receipt.serialNo,
    recipientName: receipt.recipientName,
    subject: receipt.subject,
    amount: receipt.amount,
    taxAmount: receipt.taxAmount,
    issuedAt: receipt.issuedAt,
    detailUrl: input.detailUrl,
  });
}
