import "server-only";
import { InquiryReplyEmail } from "@/shared/emails/inquiry-reply";
import { EMAIL_TEMPLATE_TYPE } from "@/shared/lib/validations/enums/helpers";
import { omitUndefined } from "../serialize";
import { sendEmail } from "./send";
import { resolveTemplate } from "./resolve-template";
import type { InquiryReplyEmailData, EmailResult } from "./types";

export async function sendInquiryReplyEmail(
  data: InquiryReplyEmailData,
): Promise<EmailResult> {
  const variables = omitUndefined({
    customerName: data.customerName,
    inquirySubject: data.originalSubject,
    originalMessage: data.originalMessage,
    replyMessage: data.replyMessage,
    repliedByName: data.repliedByName,
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.INQUIRY_REPLY,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send(
        omitUndefined({
          from,
          to: data.customerEmail,
          subject: resolved.subject,
          react: InquiryReplyEmail(
            omitUndefined({
              originalSubject: data.originalSubject,
              originalMessage: data.originalMessage,
              replyMessage: data.replyMessage,
              repliedByName: data.repliedByName,
              greeting: resolved.greeting,
              intro: resolved.intro,
              outro: resolved.outro,
              preview: resolved.preview,
              companyName: resolved.companyName,
              footerNote: resolved.footerNote,
              supportContactText: resolved.supportContactText,
            }),
          ),
        }),
      ),
    {
      operation: "sendInquiryReplyEmail",
      inquiryId: data.inquiryId,
      email: data.customerEmail,
    },
  );
}
