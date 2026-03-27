import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { formatDateTimeShort } from "@/shared/lib/utils";
import { ReviewActionCell } from "./ReviewActionCell";

// =============================================================================
// Types
// =============================================================================

type ReviewRow = {
  id: string;
  spaceId: string;
  rating: number;
  title: string | null;
  comment: string | null;
  isPublished: boolean;
  createdAt: string;
  space: { id: string; name: string };
  customer: { id: string; lastName: string; firstName: string };
  reservationId: string;
};

type ReviewTableProps = {
  reviews: ReviewRow[];
};

// =============================================================================
// Helpers
// =============================================================================

function renderStars(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

// =============================================================================
// ReviewTable Component (Server Component)
// =============================================================================

export function ReviewTable({ reviews }: ReviewTableProps) {
  if (reviews.length === 0) {
    return <EmptyState message="レビューがありません" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>スペース名</TableHead>
              <TableHead>顧客名</TableHead>
              <TableHead className="whitespace-nowrap">評価</TableHead>
              <TableHead className="hidden md:table-cell">タイトル</TableHead>
              <TableHead className="hidden md:table-cell">投稿日</TableHead>
              <TableHead className="whitespace-nowrap">公開状態</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((review) => (
              <TableRow key={review.id}>
                <TableCell>
                  <Link
                    href={`/admin/spaces/${review.space.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {review.space.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/customers/${review.customer.id}`}
                    className="text-primary hover:underline"
                  >
                    {review.customer.lastName} {review.customer.firstName}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap text-warning">
                  {renderStars(review.rating)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="max-w-xs truncate">{review.title ?? "-"}</div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {formatDateTimeShort(review.createdAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge variant={review.isPublished ? "success" : "secondary"}>
                    {review.isPublished ? "公開" : "非公開"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ReviewActionCell
                    reviewId={review.id}
                    isPublished={review.isPublished}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
