import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { PostStatusBadge } from "@/admin/components/status-badges";
import { PostActionCell } from "./PostActionCell";
import { formatDateTimeShort } from "@/shared/lib/utils";
import type { PostListData } from "@/shared/domain/posts/types";

// =============================================================================
// Types
// =============================================================================

type PostTableProps = {
  posts: PostListData[];
};

// =============================================================================
// PostTable Component (Server Component)
// =============================================================================

export function PostTable({ posts }: PostTableProps) {
  if (posts.length === 0) {
    return (
      <EmptyState
        message="投稿がありません"
        action={{ label: "新規作成", href: "/admin/posts/new" }}
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
              <TableHead className="hidden md:table-cell">カテゴリ</TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                PV
              </TableHead>
              <TableHead className="hidden md:table-cell">公開日時</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((post) => (
              <TableRow key={post.id}>
                <TableCell>
                  <PostStatusBadge status={post.status} />
                </TableCell>
                <TableCell>
                  <div>
                    <div className="max-w-xs truncate font-medium">
                      {post.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      /{post.slug}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="outline">{post.category.name}</Badge>
                </TableCell>
                <TableCell className="hidden text-right text-muted-foreground lg:table-cell">
                  {post.viewCount.toLocaleString()}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {post.publishedAt
                    ? formatDateTimeShort(post.publishedAt)
                    : "-"}
                </TableCell>
                <TableCell>
                  <PostActionCell postId={post.id} status={post.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
