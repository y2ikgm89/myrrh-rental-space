"use client";

/**
 * FaqReviewView
 *
 * /admin/faq/review のクライアント側オーケストレーター。
 * カテゴリを横断した「対応すべき質問」のフラット一覧を表示し、
 * 各行の編集は所属カテゴリにスコープした FaqItemDialog で完結する。
 *
 * フィルタ切替は FaqReviewFilterTabs（nuqs shallow:false で RSC 再取得）。
 */

import { useState } from "react";
import Link from "next/link";
import {
  Badge,
  PublishSwitch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { stopRowClick } from "@/admin/components/table";
import { EmptyState } from "@/admin/components/EmptyState";
import { updateFaqItemPublished } from "@/admin/actions/faq";
import { formatDateShort } from "@/shared/lib/date-format";
import { PUBLISH_LABELS } from "@/shared/lib/validations/enums/helpers";
import type { AdminFaqReviewFilter } from "@/shared/lib/nuqs";
import type { FaqItemWithCategory } from "@/shared/domain/faq/types";
import { FaqHelpfulnessBadge } from "./FaqHelpfulnessBadge";
import { FaqItemActionCell } from "./FaqItemActionCell";
import { FaqItemDialog } from "./FaqItemDialog";

type FaqReviewViewProps = {
  readonly filter: AdminFaqReviewFilter;
  readonly items: readonly FaqItemWithCategory[];
  readonly allCategories: readonly { id: string; name: string }[];
  readonly totalItems: number;
};

const EMPTY_MESSAGE: Record<AdminFaqReviewFilter, string> = {
  draft: "未公開の質問はありません",
  stale: "長期間更新されていない公開中の質問はありません",
  "low-rated": "「役に立たなかった」票が付いた質問はありません",
};

export function FaqReviewView({
  filter,
  items,
  allCategories,
  totalItems,
}: FaqReviewViewProps) {
  const [editingItem, setEditingItem] = useState<FaqItemWithCategory | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleEdit = (item: FaqItemWithCategory) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <EmptyState message={EMPTY_MESSAGE[filter]} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {totalItems} 件 / 行クリックで編集
          </p>
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>質問</TableHead>
                    <TableHead>カテゴリ</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">
                      役立ち
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      更新日時
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      公開状態
                    </TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      tabIndex={0}
                      aria-label={`${item.question} を編集`}
                      onClick={() => handleEdit(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleEdit(item);
                        }
                      }}
                      className="group cursor-pointer transition-colors hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <TableCell>
                        <span className="font-medium">{item.question}</span>
                      </TableCell>
                      <TableCell onClick={stopRowClick}>
                        <Link
                          href={`/admin/faq/${item.categoryId}`}
                          className="inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <Badge variant="outline">{item.category.name}</Badge>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden text-right lg:table-cell">
                        <FaqHelpfulnessBadge
                          helpful={item.helpfulCount}
                          notHelpful={item.notHelpfulCount}
                        />
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {formatDateShort(item.updatedAt)}
                      </TableCell>
                      <TableCell
                        className="hidden md:table-cell"
                        onClick={stopRowClick}
                      >
                        <PublishSwitch
                          id={item.id}
                          isPublished={item.isPublished}
                          onToggle={updateFaqItemPublished}
                          resourceLabel={`${item.question} の公開状態`}
                          label={{
                            published: PUBLISH_LABELS.published,
                            unpublished: PUBLISH_LABELS.draft,
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right" onClick={stopRowClick}>
                        <FaqItemActionCell
                          id={item.id}
                          question={item.question}
                          categoryId={item.categoryId}
                          categories={allCategories}
                          onEdit={() => handleEdit(item)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {editingItem && (
        <FaqItemDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          categoryId={editingItem.categoryId}
          item={editingItem}
        />
      )}
    </div>
  );
}
