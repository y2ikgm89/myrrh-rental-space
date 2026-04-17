import "server-only";
import { ReviewReplyEmail } from "@/shared/emails/review-reply";
import { EMAIL_TEMPLATE_TYPE } from "@/shared/lib/validations/enums/helpers";
import { omitUndefined } from "../serialize";
import { sendEmail } from "./send";
import { resolveTemplate } from "./resolve-template";
import type { ReviewReplyEmailData, EmailResult } from "./types";

export async function sendReviewReplyEmail(
  data: ReviewReplyEmailData,
): Promise<EmailResult> {
  const variables = omitUndefined({
    customerName: data.customerName,
    spaceName: data.spaceName,
    rating: String(data.rating),
    reviewTitle: data.originalTitle ?? "",
    originalComment: data.originalComment ?? "",
    replyBody: data.replyBody,
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.REVIEW_REPLY,
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
          react: ReviewReplyEmail(
            omitUndefined({
              spaceName: data.spaceName,
              rating: data.rating,
              originalTitle: data.originalTitle,
              originalComment: data.originalComment,
              replyBody: data.replyBody,
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
      operation: "sendReviewReplyEmail",
      reviewId: data.reviewId,
      email: data.customerEmail,
    },
  );
}
