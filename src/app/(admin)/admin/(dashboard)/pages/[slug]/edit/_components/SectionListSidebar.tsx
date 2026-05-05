"use client";

/**
 * SectionListSidebar — 編集ページのセクション一覧サイドバー
 *
 * D6 完了版: dnd-kit による drag-and-drop reorder 配線済み。
 *
 * - 追加ボタンで `onAddClick`（親で AddSectionDialog を開く）
 * - 各 item で toggle / duplicate / delete を Server Action 経由で呼び出す
 * - drag handle で並び替え → DragEnd で `arrayMove` → `reorderPageSections` 呼び出し
 * - page-hero（order=-1 固定）は `canDrag=false` / `canDuplicate=false` /
 *   `canDelete=false` で固定表示（drag handle 非表示）
 * - DndContext には `id={useId()}` 必須（hydration mismatch 回避）
 * - modifier: vertical axis 制約（`@dnd-kit/modifiers` 不使用、インライン実装）
 */

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconPlus } from "@tabler/icons-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/admin/components/ui";
import {
  deletePageSection,
  duplicatePageSection,
  reorderPageSections,
  togglePageSectionActive,
} from "@/admin/actions/page-section";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { PageSectionData } from "@/admin/actions/page-section-types";
import { SectionListItem, type SectionListItemProps } from "./SectionListItem";

/**
 * `restrictToVerticalAxis` modifier（@dnd-kit/modifiers が未インストールの
 * ため `@dnd-kit/core` の Modifier 型で同等実装。x 軸の transform を 0 に固定）
 */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

interface SortableSectionListItemProps extends SectionListItemProps {
  readonly id: string;
}

function SortableSectionListItem({
  id,
  ...itemProps
}: SortableSectionListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !itemProps.canDrag });

  const dragHandleProps: Record<string, unknown> = {
    ...attributes,
    ...listeners,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <SectionListItem
        {...itemProps}
        {...(itemProps.canDrag && { dragHandleProps })}
      />
    </div>
  );
}

interface SectionListSidebarProps {
  readonly sections: readonly PageSectionData[];
  readonly activeSectionId: string;
  readonly onSelect: (id: string) => void;
  readonly onAddClick: () => void;
  /**
   * このページのテンプレートが必須としている section type 集合（PAGE_TEMPLATES.requiredSectionTypes）。
   * 含まれる type の section は SectionListItem で削除ボタンを disabled + tooltip 表示する。
   * 未指定時は必須判定なし（全 section が削除可）。
   */
  readonly requiredSectionTypes?: ReadonlySet<string>;
}

export function SectionListSidebar({
  sections,
  activeSectionId,
  onSelect,
  onAddClick,
  requiredSectionTypes,
}: SectionListSidebarProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const dndId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleToggle = (id: string) => {
    startTransition(async () => {
      const result = await togglePageSectionActive(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleDuplicate = (id: string) => {
    startTransition(async () => {
      const result = await duplicatePageSection(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("セクションを複製しました");
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("このセクションを削除しますか？")) return;
    startTransition(async () => {
      const result = await deletePageSection(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("セクションを削除しました");
      router.refresh();
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // page-hero は order=-1 固定。並び替え対象外（draggable のみ extract）
    const draggable = sections.filter((s) => s.type !== "page-hero");
    const oldIndex = draggable.findIndex((s) => s.id === active.id);
    const newIndex = draggable.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(draggable.slice(), oldIndex, newIndex);
    const orderedIds = reordered.map((s) => s.id);
    const pageId = sections[0]?.pageId;
    if (!pageId) return;

    startTransition(async () => {
      const result = await reorderPageSections({ pageId, orderedIds });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  const sortableIds = sections
    .filter((s) => s.type !== "page-hero")
    .map((s) => s.id);

  return (
    <aside className="space-y-2 lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-sm font-medium text-foreground">セクション</h2>
        <Button size="sm" variant="outline" onClick={onAddClick}>
          <IconPlus className="mr-1 h-4 w-4" aria-hidden="true" />
          追加
        </Button>
      </div>
      <div className="space-y-0.5 rounded-lg border border-border bg-card p-2">
        {sections.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            セクションがありません
          </p>
        ) : (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              {sections.map((section) => {
                const isPageHero = section.type === "page-hero";
                const isRequired =
                  requiredSectionTypes?.has(section.type) ?? false;
                return (
                  <SortableSectionListItem
                    key={section.id}
                    id={section.id}
                    section={section}
                    isActive={section.id === activeSectionId}
                    onClick={() => onSelect(section.id)}
                    onToggleActive={() => handleToggle(section.id)}
                    onDuplicate={() => handleDuplicate(section.id)}
                    onDelete={() => handleDelete(section.id)}
                    canDuplicate={!isPageHero}
                    canDelete={!isPageHero}
                    canDrag={!isPageHero}
                    {...(isRequired && !isPageHero
                      ? {
                          disableDeleteReason:
                            "このセクションはこのテンプレートで必須です",
                        }
                      : {})}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </aside>
  );
}
