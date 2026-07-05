"use client";

/**
 * TermsTable
 *
 * 規約一覧テーブル。D&D 並び替えで displayOrder を更新する（`reorderTerms`）。
 * displayOrder はシステム管理（create=末尾自動採番 / reorder=D&D SSoT / update=不変）。
 * 一覧はページネーション・絞り込みなしのため D&D は常時有効。
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Badge,
  PublishSwitch,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableShell,
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
import { stopRowClick } from "@/admin/components/table";
import {
  TERMS_TYPE_LABELS,
  TERMS_SCOPE_LABELS,
} from "@/shared/lib/validations/terms";
import { PUBLISH_LABELS } from "@/shared/lib/validations/enums/helpers";
import type { AdminTermsListItem } from "@/shared/domain/terms/admin-queries";
import {
  reorderTerms,
  updateTermsFooterVisibility,
  updateTermsPublished,
} from "@/admin/actions/terms";
import { isMutationError } from "@/shared/lib/mutation-result";
import { cn } from "@/shared/lib/cn";
import { TermsActionCell } from "./TermsActionCell";

interface TermsTableProps {
  readonly items: AdminTermsListItem[];
}

interface SortableRowProps {
  readonly item: AdminTermsListItem;
  readonly isPending: boolean;
  readonly onToggleFooter: (id: string, showInFooter: boolean) => void;
}

function SortableRow({ item, isPending, onToggleFooter }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: isPending });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        "group",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
      )}
    >
      <TableCell className="w-12" onClick={stopRowClick}>
        <div {...attributes} {...listeners}>
          <DragHandle disabled={isPending} />
        </div>
      </TableCell>
      <TableCell className="font-medium">{item.title}</TableCell>
      <TableCell className="hidden md:table-cell">
        <Badge variant="secondary">
          {TERMS_TYPE_LABELS[item.type] ?? item.type}
        </Badge>
      </TableCell>
      <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
        {item.slug}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {item.scopes.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {item.scopes.map((scope) => (
              <Badge key={scope} variant="outline" className="text-xs">
                {TERMS_SCOPE_LABELS[scope]}
              </Badge>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums lg:table-cell">
        {item.agreementsCount}
      </TableCell>
      <TableCell onClick={stopRowClick}>
        <Switch
          checked={item.showInFooter}
          onCheckedChange={(checked) => onToggleFooter(item.id, checked)}
          disabled={isPending}
          aria-label={`${item.title} のフッター表示`}
        />
      </TableCell>
      <TableCell onClick={stopRowClick}>
        <PublishSwitch
          id={item.id}
          isPublished={item.isPublished}
          onToggle={updateTermsPublished}
          resourceLabel={`${item.title} の公開状態`}
          label={{
            published: PUBLISH_LABELS.published,
            unpublished: PUBLISH_LABELS.draft,
          }}
        />
      </TableCell>
      <TableCell onClick={stopRowClick}>
        <TermsActionCell id={item.id} title={item.title} />
      </TableCell>
    </TableRow>
  );
}

export function TermsTable({ items: initialItems }: TermsTableProps) {
  const router = useRouter();
  const [items, setItems] = useState<AdminTermsListItem[]>(() => [
    ...initialItems,
  ]);

  // React 19: props 変化を render 中に state へ同期
  const [previousInitial, setPreviousInitial] = useState(initialItems);
  if (initialItems !== previousInitial) {
    setPreviousInitial(initialItems);
    setItems([...initialItems]);
  }

  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);

    startTransition(async () => {
      const orderedIds = reordered.map((i) => i.id);
      const result = await reorderTerms(orderedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        setItems([...initialItems]);
        return;
      }
      toast.success("規約の表示順を更新しました");
      router.refresh();
    });
  };

  const handleToggleFooter = (id: string, showInFooter: boolean) => {
    const previousItems = items;
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, showInFooter } : item,
      ),
    );

    startTransition(async () => {
      const result = await updateTermsFooterVisibility(id, showInFooter);
      if (isMutationError(result)) {
        toast.error(result.error);
        setItems(previousItems);
        return;
      }
      toast.success("フッター表示を更新しました");
      router.refresh();
    });
  };

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">
          まだ規約が登録されていません
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        ドラッグ&ドロップで公開一覧・フッター・同意チェックリストの表示順を変更できます
      </p>
      <TableShell>
        <DndContext
          id="terms-sortable"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>タイトル</TableHead>
                  <TableHead className="hidden md:table-cell">タイプ</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    スラッグ
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    同意必須
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    同意数
                  </TableHead>
                  <TableHead>フッター</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    isPending={isPending}
                    onToggleFooter={handleToggleFooter}
                  />
                ))}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      </TableShell>
    </div>
  );
}
