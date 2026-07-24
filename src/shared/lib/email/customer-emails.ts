/**
 * 顧客関連メール
 *
 * 管理者オーサリング型の顧客一斉配信メールの送信（Phase 4: 顧客管理強化）。
 *
 * @module shared/lib/email/customer-emails
 */

import "server-only";

import { findCustomersForBroadcast } from "@/shared/domain/customers/queries";
import { CustomerBroadcastEmail } from "@/shared/emails/customer-broadcast";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { createMarketingUnsubscribeArtifacts } from "@/shared/lib/tokens/marketing-unsubscribe-token";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "../errors/server";
import { hashForKey, sendEmail } from "./send";

export type CustomerBroadcastResult = {
  readonly ok: boolean;
  /** Resend への送信リクエストが成功した宛先数（Resend の suppression により実配信されない可能性はある） */
  readonly sent: number;
  /** `marketingOptIn: false`（同意ゲート）または存在しない customerId で除外された数 */
  readonly excluded: number;
};

/**
 * 管理者が任意の件名・本文で選択した顧客のうち `marketingOptIn: true` の
 * 顧客のみへ一斉配信するメール送信関数（Phase 4: 顧客管理強化）。
 *
 * `sendEventBroadcast`（T12、`event-emails.ts`）と同じ fan-out shape
 * (Promise.allSettled で個別失敗を分離) を踏襲する。設計上の判断:
 *
 * - **送信対象**: 指定された `customerIds` のうち `marketingOptIn = true` の顧客のみ。
 *   opt-out 済み顧客（および存在しない customerId）は同意ゲートとして送信対象から
 *   除外し、excluded にカウントする（`event-broadcast` の「email=null (walk-in) は
 *   skipped」と対称の判断 — ここでは opt-out が同じ役割を果たす）
 * - **idempotencyKey**: `customer-broadcast/${customer.id}/${hashForKey(customer.email)}/${params.broadcastNonce}`。
 *   同一顧客集合への再配信でも Resend が silent drop しないよう broadcastNonce
 *   (呼出側の crypto.randomUUID) を混ぜる（`sendEventBroadcast` と同型）
 * - **rate limit**: このレイヤでは実施しない（呼出側の Server Action で
 *   `customerBroadcastRateLimiter` を先に発火する）
 *
 * @returns `{ok, sent, excluded}` — 呼出側 (Server Action) が UI 表示や AuditLog metadata に使う。
 */
export async function sendCustomerBroadcast(
  customerIds: string[],
  params: {
    subject: string;
    body: string;
    broadcastNonce: string;
  },
): Promise<CustomerBroadcastResult> {
  const recipients = await findCustomersForBroadcast(customerIds);

  const excluded = customerIds.length - recipients.length;

  if (recipients.length === 0) {
    // 送信対象 0 でも ok は true とする（UI 表示は sent=0 で reflect される）
    return { ok: true, sent: 0, excluded };
  }

  const footer = await getEmailFooterData();

  const results = await Promise.allSettled(
    recipients.map((customer) => {
      const unsubscribe = createMarketingUnsubscribeArtifacts(customer.id);
      return sendEmail({
        payload: {
          to: customer.email,
          subject: params.subject,
          headers: unsubscribe.headers,
          react: CustomerBroadcastEmail({
            subject: params.subject,
            bodyText: params.body,
            unsubscribeUrl: unsubscribe.url,
            footer,
          }),
        },
        idempotencyKey: `customer-broadcast/${customer.id}/${hashForKey(customer.email)}/${params.broadcastNonce}`,
        operation: "sendCustomerBroadcast",
        context: { customerId: customer.id },
      });
    }),
  );

  let sent = 0;
  for (const [i, result] of results.entries()) {
    if (result.status === "fulfilled" && result.value.ok) {
      sent += 1;
    } else if (result.status === "rejected") {
      const customer = recipients[i];
      if (customer) {
        logError(normalizeError(result.reason), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "sendCustomerBroadcast",
            customerId: customer.id,
          },
        });
      }
    }
  }

  return { ok: true, sent, excluded };
}
