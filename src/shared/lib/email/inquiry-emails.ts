import "server-only";
import { InquiryReplyEmail } from "@/shared/emails/inquiry-reply";
import { getSeoSettings } from "@/shared/domain/settings/queries/site";
import { SITE_DEFAULTS } from "../constants";
import { hashForKey, sendEmail } from "./send";
import type { EmailResult, InquiryReplyEmailData } from "./types";

async function getSiteName(): Promise<string> {
  const seo = await getSeoSettings();
  return seo?.siteName || SITE_DEFAULTS.name;
}

export async function sendInquiryReplyEmail(
  data: InquiryReplyEmailData,
): Promise<EmailResult> {
  const siteName = await getSiteName();

  return sendEmail({
    payload: {
      to: data.customerEmail,
      subject: `【お問い合わせ回答】${data.originalSubject}`,
      react: InquiryReplyEmail({
        customerName: data.customerName,
        originalSubject: data.originalSubject,
        originalMessage: data.originalMessage,
        replyMessage: data.replyMessage,
        repliedByName: data.repliedByName,
        siteName,
      }),
    },
    idempotencyKey: `inquiry-reply/${data.inquiryId}/${hashForKey(data.replyMessage)}`,
    operation: "sendInquiryReplyEmail",
    context: {
      inquiryId: data.inquiryId,
      email: data.customerEmail,
    },
  });
}
