/**
 * 顧客関連メール
 *
 * 管理者オーサリング型の顧客一斉配信メールの送信（Phase 4: 顧客管理強化）。
 *
 * @module shared/lib/email/customer-emails
 */

import "server-only";

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
import type { CustomerBroadcastRecipient, EmailSendContext } from "./types";

export type CustomerBroadcastResult = {
  readonly ok: boolean;
  readonly sent: number;
  readonly excluded: number;
};

/**
 * 管理者が任意の件名・本文で選択した顧客のうち `marketingOptIn: true` の
 * 顧客のみへ一斉配信するメール送信関数（Phase 4: 顧客管理強化）。
 */
export async function sendCustomerBroadcast(
  recipients: readonly CustomerBroadcastRecipient[],
  excluded: number,
  params: {
    subject: string;
    body: string;
    broadcastNonce: string;
  },
  sendContext: EmailSendContext,
): Promise<CustomerBroadcastResult> {
  if (recipients.length === 0) {
    return { ok: true, sent: 0, excluded };
  }

  const footer = await getEmailFooterData();

  const results = await Promise.allSettled(
    recipients.map((customer) => {
      const unsubscribe = createMarketingUnsubscribeArtifacts(customer.id);
      return sendEmail(
        {
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
        },
        sendContext,
      );
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
