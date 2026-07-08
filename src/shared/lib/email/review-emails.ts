import "server-only";
import { ReviewReplyEmail } from "@/shared/emails/review-reply";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { buildMemberReservationUrl } from "./reservation-emails";
import { hashForKey, sendEmail } from "./send";
import type { EmailResult, ReviewReplyEmailData } from "./types";

export async function sendReviewReplyEmail(
  data: ReviewReplyEmailData,
): Promise<EmailResult> {
  const footer = await getEmailFooterData();
  const memberReservationUrl = buildMemberReservationUrl(
    data.customerUserId,
    data.reservationId,
  );

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
        ...(memberReservationUrl !== undefined ? { memberReservationUrl } : {}),
        footer,
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
