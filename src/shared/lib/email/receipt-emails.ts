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
 * `receipt-resend/<serialNo>/<issuedAtEpoch>/<nowEpoch>` を key に採用する。
 * `Date.now()` を含めるのは、初回配信が Resend 側 quarantine / 経路上の消失で
 * 届かなかった場合の正当なリトライにも新しい key を割り当てるため
 * (静的 key + token 再暗号化で payload が変わると Resend が
 * `invalid_idempotent_request` 409 を返し silent drop になる)。
 * abuse 側の連打対策は per-serial rate limiter (`receiptResendBySerialNoRateLimiter`,
 * 3req/hour) が独立に担うため、**idempotency と rate limiting を混同しない** こと。
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
  const receiptDownloadUrl = `${appUrl}/receipts/${input.serialNo}/download?token=${createReceiptDownloadToken(input.serialNo)}`;

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
    idempotencyKey: `receipt-resend/${input.serialNo}/${input.issuedAt.getTime()}/${Date.now()}`,
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
