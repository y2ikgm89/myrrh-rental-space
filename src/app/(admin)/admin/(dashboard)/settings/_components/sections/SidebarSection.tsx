"use client";

/**
 * サイドバー設定セクション（オーケストレーター）
 *
 * 状態管理・保存処理のみ担当。UI は sidebar/ サブコンポーネントに委譲。
 * Settings CRUD table 例外パターン: useState + useTransition で sortable widget 配列を管理。
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SubmitButton,
  Switch,
} from "@/admin/components/ui";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/admin/components/ui/accordion";
import { ToggleGroup, ToggleGroupItem } from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { updateSidebarSettings } from "@/admin/actions/settings";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import {
  DEFAULT_SIDEBAR_WIDGETS,
  tryParseSidebarWidgets,
  type CustomWidget,
  type PopularWidget,
  type PostListLayout,
  type RecentWidget,
  type SidebarWidget,
} from "@/shared/lib/validations/sidebar";
import { IconPlus } from "@tabler/icons-react";
import { SidebarWidgetGrid } from "./sidebar/SidebarWidgetGrid";
import { SidebarWidgetDialog } from "./sidebar/SidebarWidgetDialog";
import type { CustomWidgetFormData } from "./sidebar/SidebarWidgetDialog";
import { getWidgetId } from "./sidebar/SidebarWidgetCard";
import {
  isSettingsFormDisabled,
  type SettingsReadOnlyProps,
} from "../shared/settings-read-only";

// =============================================================================
// Types
// =============================================================================

interface SidebarSectionProps extends SettingsReadOnlyProps {
  settings: Serialized<SettingsData>;
}

// =============================================================================
// SidebarSection (orchestrator)
// =============================================================================

export function SidebarSection({
  settings,
  readOnly = false,
}: SidebarSectionProps) {
  const router = useRouter();
  const initialWidgetsParse = tryParseSidebarWidgets(settings.sidebarWidgets);
  const initialWidgets = initialWidgetsParse.success
    ? initialWidgetsParse.data
    : DEFAULT_SIDEBAR_WIDGETS;

  // --- State ---
  const [sidebarEnabled, setSidebarEnabled] = useState(settings.sidebarEnabled);
  const [widgets, setWidgets] = useState<SidebarWidget[]>(initialWidgets);
  const [storedWidgetsInvalid] = useState(!initialWidgetsParse.success);
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const [recentCount, setRecentCount] = useState(settings.sidebarRecentCount);
  const [popularCount, setPopularCount] = useState(
    settings.sidebarPopularCount,
  );
  const [tocEnabled, setTocEnabled] = useState(settings.sidebarTocEnabled);
  const [isPending, startTransition] = useTransition();
  const isDisabled = isSettingsFormDisabled(isPending, readOnly);

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
    if (sidebarEnabled !== settings.sidebarEnabled) return true;
    if (recentCount !== settings.sidebarRecentCount) return true;
    if (popularCount !== settings.sidebarPopularCount) return true;
    if (tocEnabled !== settings.sidebarTocEnabled) return true;
    if (JSON.stringify(widgets) !== JSON.stringify(initialWidgets)) return true;
    return false;
  })();

  const canSave = storedWidgetsInvalid ? resetConfirmed : isDirty;

  const handleResetWidgetsToDefaults = () => {
    setWidgets(DEFAULT_SIDEBAR_WIDGETS);
    setResetConfirmed(true);
  };

  // --- Widget sub-type helpers ---
  const recentWidget = widgets.find(
    (w): w is RecentWidget => w.type === "recent",
  );
  const popularWidget = widgets.find(
    (w): w is PopularWidget => w.type === "popular",
  );

  // --- Widget handlers ---
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

  const handleWidgetDialogSubmit = (data: CustomWidgetFormData) => {
    if (editingWidget) {
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
        sidebarTocEnabled: tocEnabled,
        expectedUpdatedAt: settings.sidebarUpdatedAt,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        if (result.code === "CONFLICT") {
          router.refresh();
        }
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
          ブログ・お知らせ記事のウィジェットサイドバーと目次サイドバーを設定します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset
          disabled={readOnly}
          className="space-y-6 border-0 p-0 m-0 min-w-0"
        >
          {storedWidgetsInvalid && (
            <Alert variant="destructive">
              <IconAlertTriangle aria-hidden="true" />
              <AlertTitle>保存されているウィジェット設定が不正です</AlertTitle>
              <AlertDescription>
                <p>
                  データベース上のウィジェット設定を読み込めませんでした。誤って上書きしないよう、保存は一時的に無効です。
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={handleResetWidgetsToDefaults}
                  disabled={isDisabled}
                >
                  デフォルトにリセット
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* サイドバー全体の有効/無効 */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">サイドバーを表示する</p>
              <p className="text-sm text-muted-foreground">
                ブログ一覧・アーカイブ、および記事詳細（目次サイドバー非表示時）で
                ウィジェットサイドバーを表示します
              </p>
            </div>
            <Switch
              checked={sidebarEnabled}
              onCheckedChange={setSidebarEnabled}
              disabled={isDisabled}
            />
          </div>

          {/* 記事目次サイドバーの有効/無効（独立設定） */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                記事の目次サイドバーを表示する
              </p>
              <p className="text-sm text-muted-foreground">
                ブログ・お知らせの記事詳細ページで、見出しから自動生成された目次サイドバーを表示します（見出し（h2）が
                2
                つ以上ある記事のみ）。目次サイドバーが表示されるページではウィジェットサイドバーは表示されません（どちらか一方のみ）。
              </p>
            </div>
            <Switch
              checked={tocEnabled}
              onCheckedChange={setTocEnabled}
              disabled={isDisabled}
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
                    disabled={isDisabled}
                  >
                    <IconPlus className="mr-1.5 h-4 w-4" />
                    カスタムウィジェット追加
                  </Button>
                </div>

                <SidebarWidgetGrid
                  widgets={widgets}
                  onDragEnd={handleDragEnd}
                  onToggle={handleToggleWidget}
                  onEdit={handleEditWidget}
                  onDelete={handleDeleteRequest}
                  disabled={isDisabled}
                />
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
                          disabled={isDisabled}
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
                          disabled={isDisabled}
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
                      <Alert variant="info">
                        <IconInfoCircle aria-hidden="true" />
                        <AlertDescription>
                          公開記事の閲覧数（viewCount）が多い順に表示します。同数の場合は公開日が新しい順です。
                        </AlertDescription>
                      </Alert>
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
                          disabled={isDisabled}
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
                          disabled={isDisabled}
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
                          disabled={isDisabled}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {!readOnly ? (
            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="サイドバー設定を保存"
                onClick={handleSave}
                disabled={!canSave}
              />
            </div>
          ) : null}

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
                    ウィジェットサイドバーは /blog
                    一覧・カテゴリ/タグアーカイブ、および記事詳細（目次サイドバー非表示時）で表示されます
                  </li>
                  <li>
                    /news
                    一覧ではウィジェットサイドバーは表示されません。お知らせ詳細は目次サイドバー非表示時のみウィジェットサイドバーを表示します
                  </li>
                  <li>
                    記事詳細で目次サイドバーが表示される場合（h2 が 2
                    つ以上かつ目次設定
                    ON）、ウィジェットサイドバーは同ページでは表示されません
                  </li>
                  <li>モバイル表示ではサイドバーは自動的に非表示になります</li>
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
                  <li>人気記事は閲覧数（viewCount）の多い順で表示されます</li>
                  <li>
                    人気記事はサムネイル左上に 01〜
                    のランキング番号を表示できます
                  </li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </fieldset>
      </CardContent>

      {/* Custom widget dialog */}
      <SidebarWidgetDialog
        key={editingWidget?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingWidget={editingWidget}
        onSubmit={handleWidgetDialogSubmit}
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
