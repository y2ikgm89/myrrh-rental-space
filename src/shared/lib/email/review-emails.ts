import "server-only";
import { ReviewReplyEmail } from "@/shared/emails/review-reply";
import { getSeoSettings } from "@/shared/domain/settings/queries/site";
import { SITE_DEFAULTS } from "../constants";
import { sendEmail } from "./send";
import type { ReviewReplyEmailData, EmailResult } from "./types";

async function getSiteName(): Promise<string> {
  const seo = await getSeoSettings();
  return seo?.siteName || SITE_DEFAULTS.name;
}

export async function sendReviewReplyEmail(
  data: ReviewReplyEmailData,
): Promise<EmailResult> {
  const siteName = await getSiteName();

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: data.customerEmail,
        subject: `【${data.spaceName}】レビューへのお返事`,
        react: ReviewReplyEmail({
          customerName: data.customerName,
          spaceName: data.spaceName,
          rating: data.rating,
          originalTitle: data.originalTitle,
          originalComment: data.originalComment,
          replyBody: data.replyBody,
          siteName,
        }),
      }),
    {
      operation: "sendReviewReplyEmail",
      reviewId: data.reviewId,
      email: data.customerEmail,
    },
  );
}
