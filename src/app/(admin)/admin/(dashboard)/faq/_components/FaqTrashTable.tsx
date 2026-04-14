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
import type {
  FaqCategoryWithItems,
  FaqItemWithCategory,
} from "@/shared/domain/faq/types";
import { FaqTrashActionCell } from "./FaqTrashActionCell";

type FaqTrashTableProps = {
  readonly categories: readonly FaqCategoryWithItems[];
  readonly items: readonly FaqItemWithCategory[];
};

function formatDeletedAt(deletedAt: string | null): string {
  if (!deletedAt) return "-";
  return new Date(deletedAt).toLocaleString("ja-JP");
}

export function FaqTrashTable({
  categories,
  items,
}: FaqTrashTableProps): ReactElement {
  const totalCount = categories.length + items.length;

  if (totalCount === 0) {
    return <EmptyState message="ゴミ箱は空です" />;
  }

  return (
    <div className="space-y-6">
      <p className="rounded-md border border-warning/30 bg-warning/5 px-4 py-2 text-xs text-muted-foreground">
        ゴミ箱に保管された項目は 30
        日経過後、自動的に完全削除される予定です（cron
        未実装、現在は手動で完全削除可能）。
      </p>

      {categories.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">
            削除済みカテゴリ ({categories.length})
          </h2>
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>カテゴリ名</TableHead>
                    <TableHead className="hidden md:table-cell">
                      スラッグ
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      削除日時
                    </TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {category.iconEmoji && (
                            <span className="text-lg" aria-hidden="true">
                              {category.iconEmoji}
                            </span>
                          )}
                          <span className="font-medium">{category.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {category.slug}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {formatDeletedAt(category.deletedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <FaqTrashActionCell
                          kind="category"
                          id={category.id}
                          displayName={category.name}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}

      {items.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">
            削除済み質問 ({items.length})
          </h2>
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>質問</TableHead>
                    <TableHead className="hidden md:table-cell">
                      カテゴリ
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      削除日時
                    </TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.question}</div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline">{item.category.name}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {formatDeletedAt(item.deletedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <FaqTrashActionCell
                          kind="item"
                          id={item.id}
                          displayName={item.question}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
