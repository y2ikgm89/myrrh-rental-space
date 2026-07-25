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
import type { DeletedNewsListItem } from "@/shared/domain/news/admin-queries";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { NewsTrashActionCell } from "./NewsTrashActionCell";

type NewsTrashTableProps = {
  readonly news: readonly DeletedNewsListItem[];
};

export function NewsTrashTable({ news }: NewsTrashTableProps): ReactElement {
  if (news.length === 0) {
    return <EmptyState message="ゴミ箱は空です" />;
  }

  return (
    <div className="space-y-6">
      <p className="rounded-md border border-warning/30 bg-warning/5 px-4 py-2 text-xs text-muted-foreground">
        ゴミ箱に保管されたお知らせは 30
        日経過後、定期ジョブにより自動的に完全削除されます。それまでは手動で復元または完全削除できます。
      </p>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>タイトル</TableHead>
                <TableHead className="hidden md:table-cell">スラッグ</TableHead>
                <TableHead className="hidden lg:table-cell">
                  ステータス
                </TableHead>
                <TableHead className="hidden md:table-cell">削除日時</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {news.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="max-w-xs truncate font-medium">
                      {item.title}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {item.slug}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="secondary">
                      {item.isPublished ? "公開" : "下書き"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDateTimeShort(item.deletedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <NewsTrashActionCell
                      id={item.id}
                      displayName={item.title}
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
