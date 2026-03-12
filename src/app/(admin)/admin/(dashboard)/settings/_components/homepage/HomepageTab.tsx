"use client";

/**
 * ホームページセクション管理タブ
 *
 * HomepageSectionモデルベースの統一セクション管理
 * - DnDで順序変更
 * - セクション別設定編集
 * - ON/OFF切り替え
 */

import "@/public/lib/sections/register-standard-sections";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Switch,
} from "@/admin/components/ui";
import {
  GripVertical,
  Settings,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  Layout,
} from "lucide-react";
import {
  updateSectionOrder,
  toggleHomepageSection,
  deleteHomepageSection,
  createHomepageSection,
  initializeDefaultSections,
} from "@/admin/actions/homepage-settings";
import type { HomepageSectionData } from "@/admin/queries/homepage-settings";
import type { Serialized } from "@/shared/lib/serialize";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import {
  getSectionDefinition,
  getRegisteredComponentIds,
} from "@/shared/lib/sections/registry";
import { renderSectionIcon } from "@/admin/components/section-icon-resolver";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";

async function fetchHomepageSections(): Promise<
  Serialized<HomepageSectionData>[]
> {
  return fetchAdminJson("/admin/api/homepage-sections");
}

// =============================================================================
// Sortable Section Item
// =============================================================================

interface SortableSectionItemProps {
  section: Serialized<HomepageSectionData>;
  onEdit: (section: Serialized<HomepageSectionData>) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  disabled: boolean;
}

function SortableSectionItem({
  section,
  onEdit,
  onToggle,
  onDelete,
  disabled,
}: SortableSectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const definition = getSectionDefinition(section.componentId);
  const label = definition?.meta.label ?? section.componentId;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border bg-card p-4 ${
        !section.isActive ? "opacity-60 bg-muted/30" : ""
      } ${isDragging ? "shadow-lg" : ""}`}
    >
      {/* Drag Handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        disabled={disabled}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Icon & Label */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="p-2 rounded-md bg-primary/10">
          {renderSectionIcon(definition?.meta.icon ?? "", "h-5 w-5 text-primary")}
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{section.title || label}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2">
        {section.isActive ? (
          <span className="flex items-center gap-1 text-xs text-success bg-success/10 px-2 py-1 rounded">
            <Eye className="h-3 w-3" />
            表示
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            <EyeOff className="h-3 w-3" />
            非表示
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Switch
          checked={section.isActive}
          onCheckedChange={(checked: boolean) => onToggle(section.id, checked)}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onEdit(section)}
          disabled={disabled}
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDelete(section.id)}
          disabled={disabled}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Add Section Dialog
// =============================================================================

interface AddSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (componentId: string) => void;
  disabled: boolean;
  existingComponentIds: string[];
  isInstagramConnected: boolean;
}

function AddSectionDialog({
  open,
  onOpenChange,
  onAdd,
  disabled,
  existingComponentIds,
  isInstagramConnected,
}: AddSectionDialogProps) {
  const allComponentIds = getRegisteredComponentIds();
  const availableComponentIds = allComponentIds.filter((componentId) => {
    // customは複数追加可能
    if (componentId === "custom") return true;
    // InstagramはAPI設定済みの場合のみ表示
    if (componentId === "instagram" && !isInstagramConnected) return false;
    // それ以外は既存タイプでなければ表示
    return !existingComponentIds.includes(componentId);
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>セクションを追加</AlertDialogTitle>
          <AlertDialogDescription>
            ホームページに追加するセクションタイプを選択
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid grid-cols-3 gap-2 py-4 max-h-[60vh] overflow-y-auto">
          {availableComponentIds.map((componentId) => {
            const definition = getSectionDefinition(componentId);
            const label = definition?.meta.label ?? componentId;
            const isCustom = componentId === "custom";
            const alreadyExists = existingComponentIds.includes(componentId);

            return (
              <button
                key={componentId}
                type="button"
                onClick={() => {
                  onAdd(componentId);
                  onOpenChange(false);
                }}
                disabled={disabled}
                className="flex flex-col items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-center disabled:opacity-50"
              >
                <div className="p-2 rounded-md bg-primary/10">
                  {renderSectionIcon(definition?.meta.icon ?? "", "h-5 w-5 text-primary")}
                </div>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  {isCustom && (
                    <p className="text-xs text-muted-foreground">
                      複数追加可能
                    </p>
                  )}
                  {alreadyExists && !isCustom && (
                    <p className="text-xs text-warning">再追加可能</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface HomepageTabProps {
  isInstagramConnected?: boolean;
  showAddDialog: boolean;
  onShowAddDialogChange: (open: boolean) => void;
}

export function HomepageTab({
  isInstagramConnected = false,
  showAddDialog,
  onShowAddDialogChange,
}: HomepageTabProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sections, setSections] = useState<
    Serialized<HomepageSectionData>[] | null
  >(null);
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(
    null,
  );

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Load sections
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchHomepageSections();
        if (!cancelled) setSections(data);
      } catch (error) {
        logger.error("Failed to load sections", {
          error: getErrorMessage(error),
        });
        if (!cancelled) toast.error("セクションの読み込みに失敗しました");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reload sections from server (used to revert optimistic updates on error)
  function reloadSections() {
    fetchHomepageSections()
      .then(setSections)
      .catch(() => {
        /* best-effort reload after optimistic revert */
      });
  }

  // Shared action handler: execute action, toast result, reload on success
  // React 19: nested startTransition is required for state updates after await
  function runActionAndReload(
    action: () => Promise<MutationResult<unknown>>,
    successMessage: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(successMessage);
      const data = await fetchHomepageSections();
      startTransition(() => {
        setSections(data);
      });
    });
  }

  // Shared optimistic handler: apply optimistic update, execute action, revert on error
  function runOptimisticAction(
    optimisticUpdate: () => void,
    action: () => Promise<MutationResult<unknown>>,
    successMessage?: string,
  ) {
    optimisticUpdate();
    startTransition(async () => {
      const result = await action();
      if (isMutationError(result)) {
        toast.error(result.error);
        reloadSections();
        return;
      }

      if (successMessage) {
        toast.success(successMessage);
      }
    });
  }

  // Handlers
  const handleToggle = (id: string, isActive: boolean) => {
    runOptimisticAction(
      () =>
        setSections(
          (prev) =>
            prev?.map((s) => (s.id === id ? { ...s, isActive } : s)) ?? null,
        ),
      () => toggleHomepageSection(id, isActive),
      isActive ? "セクションを有効にしました" : "セクションを無効にしました",
    );
  };

  const handleDeleteConfirm = () => {
    if (!deletingSectionId) return;
    const id = deletingSectionId;
    setDeletingSectionId(null);

    runOptimisticAction(
      () => setSections((prev) => prev?.filter((s) => s.id !== id) ?? null),
      () => deleteHomepageSection(id),
      "セクションを削除しました",
    );
  };

  const handleAddSection = (componentId: string) => {
    const defaultConfig = z
      .record(z.string(), z.unknown())
      .catch({})
      .parse(getSectionDefinition(componentId)?.defaultConfig ?? {});

    runActionAndReload(
      () =>
        createHomepageSection({
          componentId,
          config: defaultConfig,
          design: {},
          isActive: true,
        }),
      "セクションを作成しました",
    );
  };

  const handleInitializeDefaults = () => {
    startTransition(async () => {
      const result = await initializeDefaultSections();
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.created
          ? "デフォルトセクションを作成しました"
          : "既にセクションが存在します",
      );
      const data = await fetchHomepageSections();
      startTransition(() => {
        setSections(data);
      });
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !sections) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);

    const newSections = arrayMove(sections, oldIndex, newIndex);
    const orderUpdates = newSections.map((s, index) => ({
      id: s.id,
      order: index,
    }));

    // Optimistic update
    setSections(newSections);

    startTransition(async () => {
      const result = await updateSectionOrder({ sections: orderUpdates });
      if (isMutationError(result)) {
        toast.error(result.error);
        reloadSections();
        return;
      }

      toast.success("順序を更新しました");
    });
  };

  // Loading state
  if (sections === null) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  const existingComponentIds = sections.map((s) => s.componentId);

  return (
    <>
      {sections.length === 0 ? (
        // No sections - show initialize button
        <div className="text-center py-12">
          <div className="p-4 rounded-full bg-muted/50 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <Layout className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">セクションがありません</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            ホームページのセクションを初期化するか、新しいセクションを追加してください
          </p>
          <Button onClick={handleInitializeDefaults} disabled={isPending}>
            <Sparkles className="h-4 w-4 mr-2" />
            デフォルトセクションを作成
          </Button>
        </div>
      ) : (
        // Main list view
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sections.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {sections.map((section) => (
                <SortableSectionItem
                  key={section.id}
                  section={section}
                  onEdit={(section) =>
                    router.push(
                      `/admin/pages/homepage/edit/sections/${section.id}`,
                    )
                  }
                  onToggle={handleToggle}
                  onDelete={setDeletingSectionId}
                  disabled={isPending}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Dialogs — rendered regardless of sections count */}
      <AddSectionDialog
        open={showAddDialog}
        onOpenChange={onShowAddDialogChange}
        onAdd={handleAddSection}
        disabled={isPending}
        existingComponentIds={existingComponentIds}
        isInstagramConnected={isInstagramConnected}
      />

      <AlertDialog
        open={!!deletingSectionId}
        onOpenChange={(open: boolean) => !open && setDeletingSectionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>セクションを削除</AlertDialogTitle>
            <AlertDialogDescription>
              このセクションを削除しますか？この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
