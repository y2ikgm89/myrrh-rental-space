import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { NewsStatusBadge } from "@/admin/components/status-badges";
import { NewsActionCell } from "./NewsActionCell";
import { formatDateTimeShort } from "@/shared/lib/utils";
import type { NewsData } from "@/admin/actions/news";

// =============================================================================
// Types
// =============================================================================

type NewsTableProps = {
  news: NewsData[];
};

// =============================================================================
// NewsTable Component (Server Component)
// =============================================================================

export function NewsTable({ news }: NewsTableProps) {
  if (news.length === 0) {
    return (
      <EmptyState
        message="お知らせがありません"
        action={{ label: "新規作成", href: "/admin/news/new" }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ステータス</TableHead>
              <TableHead>タイトル</TableHead>
              <TableHead className="hidden md:table-cell">公開日時</TableHead>
              <TableHead className="hidden lg:table-cell">作成日時</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {news.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <NewsStatusBadge isPublished={item.isPublished} />
                </TableCell>
                <TableCell>
                  <div className="max-w-xs truncate font-medium">
                    {item.title}
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {item.publishedAt
                    ? formatDateTimeShort(item.publishedAt)
                    : "-"}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {formatDateTimeShort(item.createdAt)}
                </TableCell>
                <TableCell>
                  <NewsActionCell
                    newsId={item.id}
                    isPublished={item.isPublished}
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
