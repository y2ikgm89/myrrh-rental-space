"use client";

/**
 * FaqCategoryDetailView
 *
 * /admin/faq/[categoryId] のクライアント側オーケストレーター。
 * 質問一覧・質問追加/編集 Dialog・カテゴリ編集 Dialog を束ねる。
 *
 * 責務:
 * - 編集対象の item state を保持（null = create mode）
 * - Dialog の open/close ハンドリング
 * - FaqCategoryItemsTable と各 Dialog の橋渡し
 */

import { useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { Badge, Button } from "@/admin/components/ui";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { PUBLISH_LABELS } from "@/shared/lib/validations/enums/helpers";
import type {
  FaqCategoryWithItems,
  FaqItemWithCategory,
} from "@/shared/domain/faq/types";
import type { AdminFaqItemSortBy } from "@/shared/lib/nuqs";
import { FaqCategoryItemsTable } from "./FaqCategoryItemsTable";
import { FaqCategoryItemsFilters } from "./FaqCategoryItemsFilters";
import { FaqCategoryDialog } from "./FaqCategoryDialog";
import { FaqItemDialog } from "./FaqItemDialog";

type FaqCategoryDetailViewProps = {
  readonly category: FaqCategoryWithItems;
  readonly items: readonly FaqItemWithCategory[];
  readonly allCategories: readonly { id: string; name: string }[];
  readonly currentSortBy: AdminFaqItemSortBy;
  readonly totalItems: number;
};

export function FaqCategoryDetailView({
  category,
  items,
  allCategories,
  currentSortBy,
  totalItems,
}: FaqCategoryDetailViewProps) {
  const [editingItem, setEditingItem] = useState<FaqItemWithCategory | null>(
    null,
  );
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  const handleAddItem = () => {
    setEditingItem(null);
    setItemDialogOpen(true);
  };

  const handleEditItem = (item: FaqItemWithCategory) => {
    setEditingItem(item);
    setItemDialogOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {category.icon && (
              <CuratedIcon
                name={category.icon}
                className="h-6 w-6 shrink-0 text-muted-foreground"
              />
            )}
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {category.name}
            </h1>
            {!category.isActive && (
              <Badge variant="secondary">{PUBLISH_LABELS.unpublished}</Badge>
            )}
            <Badge variant="outline">{totalItems} 件</Badge>
          </div>
          {category.description && (
            <p className="text-sm text-muted-foreground sm:text-base">
              {category.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            スラッグ: <code className="font-mono">{category.slug}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCategoryDialogOpen(true)}
          >
            カテゴリを編集
          </Button>
          <Button type="button" onClick={handleAddItem}>
            <IconPlus className="mr-1 h-4 w-4" aria-hidden="true" />
            質問を追加
          </Button>
        </div>
      </div>

      <FaqCategoryItemsFilters />

      <FaqCategoryItemsTable
        categoryId={category.id}
        items={items}
        allCategories={allCategories}
        currentSortBy={currentSortBy}
        onEditItem={handleEditItem}
        onAddItem={handleAddItem}
      />

      <FaqItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        categoryId={category.id}
        {...(editingItem && { item: editingItem })}
      />

      <FaqCategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        category={category}
      />
    </>
  );
}
