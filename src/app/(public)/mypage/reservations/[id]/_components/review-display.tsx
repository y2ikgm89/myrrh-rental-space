import { Badge } from "@/public/components/design-system/badge";
import { Heading } from "@/public/components/design-system/heading";
import { StarRating } from "@/public/components/ui/star-rating";
import { formatSerializedDate } from "@/shared/lib/serialize";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewDisplayProps {
  readonly review: {
    readonly rating: number;
    readonly title: string | null;
    readonly comment: string | null;
    readonly createdAt: string;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewDisplay({ review }: ReviewDisplayProps) {
  return (
    <section className="mt-4 md:mt-8 border border-border bg-surface p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <Heading level={2} className="!text-lg">
          レビュー
        </Heading>
        <Badge variant="success">投稿済み</Badge>
      </div>

      <div className="space-y-3">
        <StarRating rating={review.rating} size={22} />

        {review.title ? <p className="font-medium">{review.title}</p> : null}

        {review.comment ? (
          <p className="text-sm text-muted-foreground">{review.comment}</p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          投稿日: {formatSerializedDate(review.createdAt)}
        </p>
      </div>
    </section>
  );
}
