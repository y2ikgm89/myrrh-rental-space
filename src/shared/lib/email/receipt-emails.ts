/**
 * 領収書関連メール送信
 *
 * ゲスト向けセルフサービス再送信リクエスト (RECEIPT-RESEND-P1) のメール送信を行う。
 *
 * @module shared/lib/email/receipt-emails
 */

import "server-only";

import { ReceiptResendEmail } from "@/shared/emails/receipt-resend";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { formatJstDateString } from "@/shared/lib/date-format";
import { createReceiptDownloadToken } from "@/shared/lib/receipt-download-token";
import { getAppUrl } from "../constants";
import { omitUndefined } from "../serialize";
import { sendEmail } from "./send";
import type { EmailResult } from "./types";

/**
 * ゲスト再送信リクエストで領収書 DL リンクを配信する。
 *
 * ## 呼出契約
 * - `serialNo`: 送信対象 Receipt の serialNo (Case B は元の番号、Case C は新番号)
 * - `previousSerialNo`: Case C (再発行) 時のみ渡す旧領収書番号
 *
 * ## Token
 * `createReceiptDownloadToken(serialNo)` で 24h TTL の新署名 URL を発行する。
 * `Receipt.usedAt` は Case B では NULL、Case C では新 Receipt なので当然 NULL。
 *
 * ## Idempotency
 * `receipt-resend/<serialNo>/<issuedAtEpoch>` を key に採用する。同一 Receipt に対する
 * 短時間の連続リクエストは rate limiter (receiptResendBySerialNoRateLimiter) で
 * 別途遮断されるため、Date.now() ではなく `issuedAt` を含めることで冪等性を保持する
 * (`Receipt.issuedAt` は Case B なら不変、Case C なら新規発行日時になる)。
 */
export async function sendReceiptResendEmail(input: {
  readonly recipientEmail: string;
  readonly serialNo: string;
  readonly recipientName: string;
  readonly subject: string;
  readonly amount: number;
  readonly taxAmount: number;
  readonly issuedAt: Date;
  readonly previousSerialNo?: string;
}): Promise<EmailResult> {
  const footer = await getEmailFooterData();
  const appUrl = getAppUrl();
  const receiptDownloadUrl = `${appUrl}/api/receipts/${input.serialNo}/pdf?token=${createReceiptDownloadToken(input.serialNo)}`;

  return sendEmail({
    payload: {
      to: input.recipientEmail,
      subject: `【領収書ダウンロードリンク】${input.serialNo}`,
      react: ReceiptResendEmail(
        omitUndefined({
          recipientName: input.recipientName,
          subject: input.subject,
          issuedAt: formatJstDateString(input.issuedAt),
          amount: formatAmountLabel(input.amount, input.taxAmount),
          serialNo: input.serialNo,
          previousSerialNo: input.previousSerialNo,
          receiptDownloadUrl,
          footer,
        }),
      ),
    },
    idempotencyKey: `receipt-resend/${input.serialNo}/${input.issuedAt.getTime()}`,
    operation: "sendReceiptResendEmail",
    context: {
      serialNo: input.serialNo,
      recipientEmail: input.recipientEmail,
    },
  });
}

/**
 * 金額表示ラベルを組み立てる (「8,800円（うち消費税 800円）」形式)。
 * `taxAmount === 0` の場合は税額表記を省略する。
 */
function formatAmountLabel(amount: number, taxAmount: number): string {
  const amountLabel = `${amount.toLocaleString("ja-JP")}円`;
  if (taxAmount > 0) {
    return `${amountLabel}（うち消費税 ${taxAmount.toLocaleString("ja-JP")}円）`;
  }
  return amountLabel;
}
