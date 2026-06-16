import {
  getPublishedReviewsForSpace,
  getSpaceReviewStats,
} from "@/shared/domain/reviews/public-queries";
import { Heading } from "../../../_shared/components/design-system/heading";
import { StarRating } from "../../../_shared/components/ui/star-rating";
import { formatSerializedDate } from "@/shared/lib/serialize";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpaceReviewsProps {
  readonly spaceId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export async function SpaceReviews({ spaceId }: SpaceReviewsProps) {
  const [reviews, stats] = await Promise.all([
    getPublishedReviewsForSpace(spaceId),
    getSpaceReviewStats(spaceId),
  ]);

  if (stats.totalCount === 0) {
    return (
      <section className="mt-12 border-t border-border pt-12">
        <Heading level={2} className="mb-6">
          レビュー
        </Heading>
        <p className="text-muted-foreground">まだレビューはありません</p>
      </section>
    );
  }

  return (
    <section className="mt-12 border-t border-border pt-12">
      <Heading level={2} className="mb-6">
        レビュー
      </Heading>

      {/* Average rating bar */}
      <div className="mb-8 flex items-center gap-4">
        <span className="font-heading text-3xl font-light">
          {stats.averageRating.toFixed(1)}
        </span>
        <div>
          <StarRating rating={stats.averageRating} size={22} />
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.totalCount}件のレビュー
          </p>
        </div>
      </div>

      {/* Review list */}
      <div className="space-y-6">
        {reviews.map((review) => (
          <article
            key={review.id}
            className="border-b border-border pb-6 last:border-b-0"
          >
            <div className="mb-2 flex items-center gap-3">
              <StarRating rating={review.rating} size={16} />
              <time
                className="text-xs text-muted-foreground"
                dateTime={review.createdAt}
              >
                {formatSerializedDate(review.createdAt)}
              </time>
            </div>
            {review.title ? (
              <p className="mb-1 font-medium">{review.title}</p>
            ) : null}
            {review.comment ? (
              <p className="text-sm text-muted-foreground">{review.comment}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {review.customerInitial}
            </p>
            {review.replyBody ? (
              <div className="mt-4 border-l-2 border-accent pl-4">
                <p className="mb-2 text-eyebrow uppercase text-accent">
                  店舗からの返信
                </p>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {review.replyBody}
                </p>
                {review.repliedAt ? (
                  <time
                    className="mt-2 block text-xs text-muted-foreground"
                    dateTime={review.repliedAt}
                  >
                    {formatSerializedDate(review.repliedAt)}
                  </time>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
