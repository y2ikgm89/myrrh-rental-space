import "server-only";
import { CustomerMergeVerificationEmail } from "@/shared/emails/customer-merge-verification";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { hashForKey, sendEmail } from "./send";
import type {
  CustomerMergeVerificationEmailData,
  EmailResult,
  EmailSendContext,
} from "./types";

/**
 * マイページからの guest 履歴統合の本人確認 URL を guest email 宛に送信。
 */
export async function sendCustomerMergeVerificationEmail(
  data: CustomerMergeVerificationEmailData,
  sendContext: EmailSendContext,
): Promise<EmailResult> {
  const footer = await getEmailFooterData();

  return sendEmail(
    {
      payload: {
        to: data.email,
        subject: `【履歴統合の確認】${footer.siteName}`,
        react: CustomerMergeVerificationEmail({
          name: data.name,
          guestEmail: data.guestEmail,
          verificationUrl: data.verificationUrl,
          reservationCount: data.reservationCount,
          inquiryCount: data.inquiryCount,
          reviewCount: data.reviewCount,
          registrationCount: data.registrationCount,
          siteName: footer.siteName,
          footer,
        }),
      },
      idempotencyKey: `customer-merge-verification/${hashForKey(data.verificationUrl)}`,
      operation: "sendCustomerMergeVerificationEmail",
      context: {
        email: data.email,
      },
    },
    sendContext,
  );
}
