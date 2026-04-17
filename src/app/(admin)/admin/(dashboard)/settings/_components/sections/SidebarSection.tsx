"use client";

/**
 * サイドバー設定セクション
 *
 * dnd-kit ソータブルウィジェットリスト + カスタムウィジェット追加/編集/削除
 * Settings CRUD table 例外パターン: useState + useTransition（useFormAction 不使用）
 */

import { useState, useTransition } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { DndContext, closestCenter } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { toast } from "sonner";
import { cn } from "@/shared/lib/cn";
import { toTranslate3d } from "@/admin/components/ui/sortable";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/admin/components/ui/accordion";
import { ToggleGroup, ToggleGroupItem } from "@/admin/components/ui";
import { updateSidebarSettings } from "@/admin/actions/settings";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import {
  parseSidebarWidgets,
  type CustomWidget,
  type PopularWidget,
  type PostListLayout,
  type RecentWidget,
  type SidebarWidget,
} from "@/shared/lib/validations/sidebar";
import {
  IconGripVertical,
  IconPlus,
  IconSearch,
  IconArticle,
  IconFlame,
  IconCategory,
  IconTag,
  IconApps,
} from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";

// =============================================================================
// Constants
// =============================================================================

const WIDGET_LABELS: Record<string, string> = {
  search: "検索",
  recent: "新着記事",
  popular: "人気記事",
  categories: "カテゴリー",
  tags: "タグ",
};

const WIDGET_ICONS: Record<string, TablerIcon> = {
  search: IconSearch,
  recent: IconArticle,
  popular: IconFlame,
  categories: IconCategory,
  tags: IconTag,
};

// =============================================================================
// Types
// =============================================================================

interface SidebarSectionProps {
  settings: Serialized<SettingsData>;
}

interface CustomWidgetFormData {
  title: string;
  description: string;
  linkUrl: string;
  linkLabel: string;
}

const EMPTY_FORM: CustomWidgetFormData = {
  title: "",
  description: "",
  linkUrl: "",
  linkLabel: "",
};

// =============================================================================
// Helpers
// =============================================================================

function getWidgetId(w: SidebarWidget): string {
  return w.type === "custom" ? w.id : w.type;
}

function getWidgetLabel(w: SidebarWidget): string {
  if (w.type === "custom") return w.title;
  return WIDGET_LABELS[w.type] ?? w.type;
}

function renderWidgetIcon(w: SidebarWidget): ReactElement {
  const Icon =
    w.type === "custom" ? IconApps : (WIDGET_ICONS[w.type] ?? IconApps);
  return <Icon className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function isCustomWidget(w: SidebarWidget): w is CustomWidget {
  return w.type === "custom";
}

// =============================================================================
// SortableWidgetItem
// =============================================================================

interface SortableWidgetItemProps {
  widget: SidebarWidget;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (widget: CustomWidget) => void;
  onDelete: (id: string, name: string) => void;
  disabled: boolean;
}

function SortableWidgetItem({
  widget,
  onToggle,
  onEdit,
  onDelete,
  disabled,
}: SortableWidgetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: getWidgetId(widget) });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  const label = getWidgetLabel(widget);
  const widgetId = getWidgetId(widget);
  const custom = isCustomWidget(widget);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-3 rounded-md border p-3 transition-colors",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
        !widget.enabled && "opacity-60 bg-muted/30",
      )}
    >
      {/* Drag Handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground shrink-0"
        {...attributes}
        {...listeners}
        disabled={disabled}
      >
        <IconGripVertical className="h-4 w-4" />
      </button>

      {/* Icon */}
      {renderWidgetIcon(widget)}

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {custom && widget.description && (
          <p className="text-xs text-muted-foreground truncate">
            {widget.description}
          </p>
        )}
      </div>

      {/* Enabled switch */}
      <Switch
        checked={widget.enabled}
        onCheckedChange={(checked) => onToggle(widgetId, checked)}
        disabled={disabled}
      />

      {/* Action menu for custom widgets only */}
      {custom && (
        <ActionDropdown disabled={disabled}>
          <ActionDropdownItem onClick={() => onEdit(widget)}>
            編集
          </ActionDropdownItem>
          <ActionDropdownSeparator />
          <ActionDropdownItem
            destructive
            onClick={() => onDelete(widgetId, label)}
          >
            削除
          </ActionDropdownItem>
        </ActionDropdown>
      )}
    </div>
  );
}

// =============================================================================
// CustomWidgetDialog
// =============================================================================

interface CustomWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingWidget: CustomWidget | null;
  onSubmit: (data: CustomWidgetFormData) => void;
}

function CustomWidgetDialog({
  open,
  onOpenChange,
  editingWidget,
  onSubmit,
}: CustomWidgetDialogProps) {
  const [form, setForm] = useState<CustomWidgetFormData>(() =>
    editingWidget
      ? {
          title: editingWidget.title,
          description: editingWidget.description ?? "",
          linkUrl: editingWidget.linkUrl ?? "",
          linkLabel: editingWidget.linkLabel ?? "",
        }
      : EMPTY_FORM,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSubmit(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingWidget
              ? "カスタムウィジェットを編集"
              : "カスタムウィジェットを追加"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="widget-title">
              タイトル <span className="text-destructive">*</span>
            </Label>
            <Input
              id="widget-title"
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="ウィジェットタイトル"
              required
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="widget-description">説明</Label>
            <Textarea
              id="widget-description"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="ウィジェットの説明（任意）"
              maxLength={500}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="widget-link-url">リンクURL</Label>
            <Input
              id="widget-link-url"
              value={form.linkUrl}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, linkUrl: e.target.value }))
              }
              placeholder="https://..."
              maxLength={500}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="widget-link-label">リンクラベル</Label>
            <Input
              id="widget-link-label"
              value={form.linkLabel}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  linkLabel: e.target.value,
                }))
              }
              placeholder="もっと見る"
              maxLength={100}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={!form.title.trim()}>
              {editingWidget ? "更新" : "追加"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// SidebarSection (main)
// =============================================================================

export function SidebarSection({ settings }: SidebarSectionProps) {
  const router = useRouter();

  // --- State ---
  const [sidebarEnabled, setSidebarEnabled] = useState(
    settings.sidebarEnabled ?? true,
  );
  const [widgets, setWidgets] = useState<SidebarWidget[]>(() =>
    parseSidebarWidgets(settings.sidebarWidgets),
  );
  const [recentCount, setRecentCount] = useState(
    settings.sidebarRecentCount ?? 5,
  );
  const [popularCount, setPopularCount] = useState(
    settings.sidebarPopularCount ?? 5,
  );
  const [isPending, startTransition] = useTransition();

  // --- Custom widget dialog ---
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<CustomWidget | null>(null);

  // --- Delete confirmation dialog ---
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // --- Dirty check ---
  const isDirty = (() => {
    const initial = parseSidebarWidgets(settings.sidebarWidgets);
    if (sidebarEnabled !== (settings.sidebarEnabled ?? true)) return true;
    if (recentCount !== (settings.sidebarRecentCount ?? 5)) return true;
    if (popularCount !== (settings.sidebarPopularCount ?? 5)) return true;
    if (JSON.stringify(widgets) !== JSON.stringify(initial)) return true;
    return false;
  })();

  // --- Widget helpers ---
  const recentWidget = widgets.find(
    (w): w is RecentWidget => w.type === "recent",
  );
  const popularWidget = widgets.find(
    (w): w is PopularWidget => w.type === "popular",
  );

  const handleChangeRecentLayout = (layout: PostListLayout) => {
    setWidgets((prev) =>
      prev.map((w) => (w.type === "recent" ? { ...w, layout } : w)),
    );
  };

  const handleChangePopularLayout = (layout: PostListLayout) => {
    setWidgets((prev) =>
      prev.map((w) => (w.type === "popular" ? { ...w, layout } : w)),
    );
  };

  const handleTogglePopularRanking = (showRanking: boolean) => {
    setWidgets((prev) =>
      prev.map((w) => (w.type === "popular" ? { ...w, showRanking } : w)),
    );
  };

  const handleToggleWidget = (id: string, enabled: boolean) => {
    setWidgets((prev) =>
      prev.map((w) => (getWidgetId(w) === id ? { ...w, enabled } : w)),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setWidgets((prev) => {
      const oldIndex = prev.findIndex(
        (w) => getWidgetId(w) === String(active.id),
      );
      const newIndex = prev.findIndex(
        (w) => getWidgetId(w) === String(over.id),
      );
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleAddCustomWidget = (data: CustomWidgetFormData) => {
    if (editingWidget) {
      // Edit existing
      setWidgets((prev) =>
        prev.map((w) =>
          w.type === "custom" && w.id === editingWidget.id
            ? {
                ...w,
                title: data.title,
                description: data.description || undefined,
                linkUrl: data.linkUrl || undefined,
                linkLabel: data.linkLabel || undefined,
              }
            : w,
        ),
      );
    } else {
      // Add new
      const newWidget: CustomWidget = {
        type: "custom",
        enabled: true,
        id: crypto.randomUUID(),
        title: data.title,
        description: data.description || undefined,
        linkUrl: data.linkUrl || undefined,
        linkLabel: data.linkLabel || undefined,
      };
      setWidgets((prev) => [...prev, newWidget]);
    }
    setEditingWidget(null);
  };

  const handleEditWidget = (widget: CustomWidget) => {
    setEditingWidget(widget);
    setDialogOpen(true);
  };

  const handleOpenAddDialog = () => {
    setEditingWidget(null);
    setDialogOpen(true);
  };

  const handleDeleteRequest = (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    setWidgets((prev) =>
      prev.filter((w) => getWidgetId(w) !== deleteTarget.id),
    );
    setDeleteTarget(null);
  };

  // --- Save ---
  const handleSave = () => {
    startTransition(async () => {
      const result = await updateSidebarSettings({
        sidebarEnabled,
        sidebarWidgets: widgets,
        sidebarRecentCount: recentCount,
        sidebarPopularCount: popularCount,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("サイドバー設定を保存しました");
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>サイドバー設定</CardTitle>
        <CardDescription>
          ブログページのサイドバー表示とウィジェット設定を行います
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* サイドバー全体の有効/無効 */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">サイドバーを表示する</p>
            <p className="text-sm text-muted-foreground">
              ブログページでサイドバーを表示します
            </p>
          </div>
          <Switch
            checked={sidebarEnabled}
            onCheckedChange={setSidebarEnabled}
            disabled={isPending}
          />
        </div>

        {/* ウィジェット設定 */}
        {sidebarEnabled && (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">ウィジェット</h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenAddDialog}
                  disabled={isPending}
                >
                  <IconPlus className="mr-1.5 h-4 w-4" />
                  カスタムウィジェット追加
                </Button>
              </div>

              <DndContext
                id="sidebar-widgets-sortable"
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={widgets.map(getWidgetId)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {widgets.map((widget) => (
                      <SortableWidgetItem
                        key={getWidgetId(widget)}
                        widget={widget}
                        onToggle={handleToggleWidget}
                        onEdit={handleEditWidget}
                        onDelete={handleDeleteRequest}
                        disabled={isPending}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* 記事ウィジェット設定 */}
            {(recentWidget?.enabled || popularWidget?.enabled) && (
              <div className="space-y-6">
                <h4 className="text-sm font-medium">記事ウィジェット設定</h4>

                {recentWidget?.enabled && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <p className="text-sm font-medium">新着記事</p>
                    <div className="space-y-2">
                      <Label htmlFor="sidebar-recent-count">表示件数</Label>
                      <Input
                        id="sidebar-recent-count"
                        type="number"
                        min="1"
                        max="20"
                        value={recentCount}
                        onChange={(e) =>
                          setRecentCount(parseInt(e.target.value, 10) || 5)
                        }
                        disabled={isPending}
                      />
                      <p className="text-sm text-muted-foreground">
                        1〜20件の範囲で指定してください
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>レイアウト</Label>
                      <ToggleGroup
                        type="single"
                        value={recentWidget.layout}
                        onValueChange={(v) => {
                          if (v === "compact" || v === "stacked") {
                            handleChangeRecentLayout(v);
                          }
                        }}
                        disabled={isPending}
                      >
                        <ToggleGroupItem value="compact">
                          コンパクト
                        </ToggleGroupItem>
                        <ToggleGroupItem value="stacked">
                          縦積み
                        </ToggleGroupItem>
                      </ToggleGroup>
                      <p className="text-sm text-muted-foreground">
                        コンパクト: 横並びサムネ（5件推奨） / 縦積み:
                        大きなサムネ（3件推奨）
                      </p>
                    </div>
                  </div>
                )}

                {popularWidget?.enabled && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <p className="text-sm font-medium">人気記事</p>
                    <div className="space-y-2">
                      <Label htmlFor="sidebar-popular-count">表示件数</Label>
                      <Input
                        id="sidebar-popular-count"
                        type="number"
                        min="1"
                        max="20"
                        value={popularCount}
                        onChange={(e) =>
                          setPopularCount(parseInt(e.target.value, 10) || 5)
                        }
                        disabled={isPending}
                      />
                      <p className="text-sm text-muted-foreground">
                        1〜20件の範囲で指定してください
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>レイアウト</Label>
                      <ToggleGroup
                        type="single"
                        value={popularWidget.layout}
                        onValueChange={(v) => {
                          if (v === "compact" || v === "stacked") {
                            handleChangePopularLayout(v);
                          }
                        }}
                        disabled={isPending}
                      >
                        <ToggleGroupItem value="compact">
                          コンパクト
                        </ToggleGroupItem>
                        <ToggleGroupItem value="stacked">
                          縦積み
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="sidebar-popular-ranking">
                          ランキング番号を表示
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          サムネイル左上に 01〜 の連番を重ねます
                        </p>
                      </div>
                      <Switch
                        id="sidebar-popular-ranking"
                        checked={popularWidget.showRanking}
                        onCheckedChange={handleTogglePopularRanking}
                        disabled={isPending}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* 保存ボタン */}
        <div className="flex justify-end pt-2">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || !isDirty}
          >
            {isPending ? "保存中..." : "サイドバー設定を保存"}
          </Button>
        </div>

        {/* ヒント */}
        <Accordion type="single" collapsible>
          <AccordionItem
            value="hints"
            className="rounded-lg border bg-muted/50 px-4 border-b last:border-b"
          >
            <AccordionTrigger className="text-sm">ヒント</AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-4">
                <li>
                  サイドバーは記事一覧ページと記事詳細ページで表示されます
                </li>
                <li>モバイル表示では自動的に非表示になります</li>
                <li>ドラッグ&ドロップでウィジェットの表示順を変更できます</li>
                <li>各ウィジェットは個別にオン/オフできます</li>
                <li>
                  カスタムウィジェットでは自由なテキストとリンクを追加できます
                </li>
                <li>表示件数は1〜20件の範囲で設定できます</li>
                <li>
                  新着・人気記事はコンパクト（横並び）/
                  縦積みの2種類のレイアウトから選べます
                </li>
                <li>
                  人気記事はサムネイル左上に 01〜 のランキング番号を表示できます
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>

      {/* Custom widget dialog */}
      <CustomWidgetDialog
        key={editingWidget?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingWidget={editingWidget}
        onSubmit={handleAddCustomWidget}
      />

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        itemName={deleteTarget?.name ?? ""}
        onConfirm={handleDeleteConfirm}
      />
    </Card>
  );
}
