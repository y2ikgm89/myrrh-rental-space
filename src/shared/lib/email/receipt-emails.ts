/**
 * 領収書関連メール送信
 *
 * - 新規発行通知 (`sendReceiptIssuedEmail`) — ゲスト・会員双方
 * - ゲスト向けセルフサービス再送信 (`sendReceiptResendEmail`, RECEIPT-RESEND-P1)
 *
 * @module shared/lib/email/receipt-emails
 */

import "server-only";

import { ReceiptIssuedEmail } from "@/shared/emails/receipt-issued";
import { ReceiptResendEmail } from "@/shared/emails/receipt-resend";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { formatDateWithWeekday } from "@/shared/lib/date-format";
import { createReceiptDownloadToken } from "@/shared/lib/receipt-download-token";
import { getAppUrl } from "../constants";
import { omitUndefined } from "../serialize";
import { sendEmail } from "./send";
import type {
  EmailResult,
  ReceiptIssuedEmailData,
  EmailSendContext,
} from "./types";

/**
 * 新規発行通知の Resend idempotency key。
 *
 * `receipt-issued/<serialNo>`（静的）。同一 serial への再送は first-send-wins。
 * 初回配信が Resend 側で消失した場合の正当な再送は、admin / ゲスト再送信
 * (`sendReceiptResendEmail`) フローを使うこと（本 key では再送できない）。
 */
export function buildReceiptIssuedIdempotencyKey(serialNo: string): string {
  return `receipt-issued/${serialNo}`;
}

/**
 * 領収書の新規発行通知メールを送信する（ゲスト・会員共通）。
 *
 * ## 呼出契約
 * - `detailUrl`: CTA 先。会員 mypage / ゲスト status URL 等を呼出側が渡す。
 *   本関数は URL を生成しない（PDF API 直リンクも組み立てない）。
 *
 * ## Idempotency
 * {@link buildReceiptIssuedIdempotencyKey} — 静的 key、first-send-wins。
 */
export async function sendReceiptIssuedEmail(
  input: ReceiptIssuedEmailData,
  sendContext: EmailSendContext,
): Promise<EmailResult> {
  const footer = await getEmailFooterData();

  return sendEmail(
    {
      payload: {
        to: input.recipientEmail,
        subject: `【領収書発行】${input.serialNo}`,
        react: ReceiptIssuedEmail({
          recipientName: input.recipientName,
          subject: input.subject,
          issuedAt: formatDateWithWeekday(input.issuedAt),
          amount: formatAmountLabel(input.amount, input.taxAmount),
          serialNo: input.serialNo,
          detailUrl: input.detailUrl,
          footer,
        }),
      },
      idempotencyKey: buildReceiptIssuedIdempotencyKey(input.serialNo),
      operation: "sendReceiptIssuedEmail",
      context: {
        serialNo: input.serialNo,
        recipientEmail: input.recipientEmail,
      },
    },
    sendContext,
  );
}

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
export async function sendReceiptResendEmail(
  input: {
    readonly recipientEmail: string;
    readonly serialNo: string;
    readonly recipientName: string;
    readonly subject: string;
    readonly amount: number;
    readonly taxAmount: number;
    readonly issuedAt: Date;
    readonly previousSerialNo?: string;
  },
  sendContext: EmailSendContext,
): Promise<EmailResult> {
  const footer = await getEmailFooterData();
  const appUrl = getAppUrl();
  const receiptDownloadUrl = `${appUrl}/receipts/${input.serialNo}/download?token=${createReceiptDownloadToken(input.serialNo)}`;

  return sendEmail(
    {
      payload: {
        to: input.recipientEmail,
        subject: `【領収書ダウンロードリンク】${input.serialNo}`,
        react: ReceiptResendEmail(
          omitUndefined({
            recipientName: input.recipientName,
            subject: input.subject,
            issuedAt: formatDateWithWeekday(input.issuedAt),
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
    },
    sendContext,
  );
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
