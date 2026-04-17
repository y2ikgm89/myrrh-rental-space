import "server-only";
import { ReviewReplyEmail } from "@/shared/emails/review-reply";
import { getSeoSettings } from "@/shared/domain/settings/queries/site";
import { SITE_DEFAULTS } from "../constants";
import { hashForKey, sendEmail } from "./send";
import type { EmailResult, ReviewReplyEmailData } from "./types";

async function getSiteName(): Promise<string> {
  const seo = await getSeoSettings();
  return seo?.siteName || SITE_DEFAULTS.name;
}

export async function sendReviewReplyEmail(
  data: ReviewReplyEmailData,
): Promise<EmailResult> {
  const siteName = await getSiteName();

  return sendEmail({
    payload: {
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
    },
    idempotencyKey: `review-reply/${data.reviewId}/${hashForKey(data.replyBody)}`,
    operation: "sendReviewReplyEmail",
    context: {
      reviewId: data.reviewId,
      email: data.customerEmail,
    },
  });
}
