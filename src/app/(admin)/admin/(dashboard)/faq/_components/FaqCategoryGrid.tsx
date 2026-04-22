"use client";

/**
 * FaqCategoryGrid
 *
 * カテゴリ一覧（master 側）。DnD で並び順を変更し、
 * 各カテゴリカードクリックで /admin/faq/[categoryId] 詳細ページへ遷移する。
 *
 * 操作:
 * - カード全体（DragHandle / ActionDropdown / 削除以外）クリック → Link 遷移
 * - ActionDropdown → 編集 Dialog / 削除 Dialog
 * - DragHandle → カード上下並び替え
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Badge,
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  toTranslate3d,
  type DragEndEvent,
} from "@/admin/components/ui";
import { DragHandle } from "@/admin/components/ui/sortable";
import { EmptyState } from "@/admin/components/EmptyState";
import { reorderFaqCategories } from "@/admin/actions/faq";
import { isMutationError } from "@/shared/lib/mutation-result";
import { cn } from "@/shared/lib/cn";
import { PUBLISH_LABELS } from "@/shared/lib/validations/enums/helpers";
import type { FaqCategoryWithItems } from "@/shared/domain/faq/types";
import { FaqCategoryActionCell } from "./FaqCategoryActionCell";

type FaqCategoryGridProps = {
  readonly categories: readonly FaqCategoryWithItems[];
  readonly onCreate: () => void;
};

type SortableCardProps = {
  readonly category: FaqCategoryWithItems;
};

function SortableCategoryCard({ category }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  const itemCount = category.items.length;
  const publishedCount = category.items.filter((i) => i.isPublished).length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors",
        "hover:border-primary/40",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="shrink-0"
        aria-label={`${category.name}をドラッグして並び替え`}
      >
        <DragHandle />
      </div>

      <Link
        href={`/admin/faq/${category.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        aria-label={`${category.name}の質問を管理`}
      >
        {category.iconEmoji && (
          <span className="text-2xl" aria-hidden="true">
            {category.iconEmoji}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-foreground">
              {category.name}
            </span>
            {!category.isActive && (
              <Badge variant="secondary">{PUBLISH_LABELS.unpublished}</Badge>
            )}
            <Badge variant="outline">
              {itemCount} 件（公開 {publishedCount}）
            </Badge>
          </div>
          {category.description && (
            <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
              {category.description}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            スラッグ: <code className="font-mono">{category.slug}</code>
          </p>
        </div>
      </Link>

      <div className="shrink-0">
        <FaqCategoryActionCell
          id={category.id}
          name={category.name}
          itemCount={itemCount}
          category={category}
        />
      </div>
    </div>
  );
}

export function FaqCategoryGrid({
  categories: initialCategories,
  onCreate,
}: FaqCategoryGridProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<FaqCategoryWithItems[]>(() => [
    ...initialCategories,
  ]);

  // props 同期（React 19 推奨パターン）
  const [previousInitial, setPreviousInitial] = useState(initialCategories);
  if (initialCategories !== previousInitial) {
    setPreviousInitial(initialCategories);
    setCategories([...initialCategories]);
  }

  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);

    startTransition(async () => {
      const orderedIds = reordered.map((c) => c.id);
      const result = await reorderFaqCategories(orderedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        setCategories([...initialCategories]);
        return;
      }
      toast.success("カテゴリの並び順を更新しました");
      router.refresh();
    });
  };

  if (categories.length === 0) {
    return (
      <EmptyState
        message="カテゴリがまだ登録されていません"
        description="まずは FAQ カテゴリを作成して、そこに質問を追加していきます"
        action={{
          label: "最初のカテゴリを作成",
          onClick: onCreate,
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        ドラッグ&ドロップで並び順を変更 / カードクリックで質問管理画面へ
      </p>
      <DndContext
        id="faq-category-sortable"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={categories.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {categories.map((category) => (
              <SortableCategoryCard key={category.id} category={category} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
