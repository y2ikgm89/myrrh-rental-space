import type { ReactElement } from "react";
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
import type { DeletedPostListItem } from "@/shared/domain/posts/admin-queries";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { POST_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { PostTrashActionCell } from "./PostTrashActionCell";

type PostTrashTableProps = {
  readonly posts: readonly DeletedPostListItem[];
};

export function PostTrashTable({ posts }: PostTrashTableProps): ReactElement {
  if (posts.length === 0) {
    return <EmptyState message="ゴミ箱は空です" />;
  }

  return (
    <div className="space-y-6">
      <p className="rounded-md border border-warning/30 bg-warning/5 px-4 py-2 text-xs text-muted-foreground">
        ゴミ箱に保管された投稿は 30
        日経過後、定期ジョブにより自動的に完全削除されます。それまでは手動で復元または完全削除できます。
      </p>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>タイトル</TableHead>
                <TableHead className="hidden md:table-cell">スラッグ</TableHead>
                <TableHead className="hidden md:table-cell">
                  カテゴリー
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  ステータス
                </TableHead>
                <TableHead className="hidden md:table-cell">削除日時</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell>
                    <div className="max-w-xs truncate font-medium">
                      {post.title}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {post.slug}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline">{post.category.name}</Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="secondary">
                      {POST_STATUS_LABELS[post.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDateTimeShort(post.deletedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <PostTrashActionCell
                      id={post.id}
                      displayName={post.title}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
