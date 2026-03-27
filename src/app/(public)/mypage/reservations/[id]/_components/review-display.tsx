import { Badge } from "@/public/components/design-system/badge";
import { Heading } from "@/public/components/design-system/heading";
import { StarRating } from "@/public/components/ui/star-rating";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewDisplayProps {
  readonly review: {
    readonly rating: number;
    readonly title: string | null;
    readonly comment: string | null;
    readonly createdAt: Date;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReviewDisplay({ review }: ReviewDisplayProps) {
  return (
    <section className="mt-8 rounded-lg border border-border bg-surface p-6">
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
          投稿日: {new Date(review.createdAt).toLocaleDateString("ja-JP")}
        </p>
      </div>
    </section>
  );
}
