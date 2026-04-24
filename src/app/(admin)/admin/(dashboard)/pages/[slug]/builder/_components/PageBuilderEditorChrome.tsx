"use client";

import Link from "next/link";
import {
  IconAlertCircle,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconEye,
  IconLoader2,
  IconPhoto,
  IconPhotoPlus,
  IconRefresh,
  IconWorld,
  IconWorldOff,
  IconWriting,
} from "@tabler/icons-react";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { Z_INDEX } from "@/admin/lib/styles/z-index";
import type { PageBuilderRevisionSummary } from "@/shared/domain/page-builder/types";
import { cn } from "@/shared/lib/cn";
import {
  PAGE_BUILDER_CANVAS_MAX_ZOOM,
  PAGE_BUILDER_CANVAS_MIN_ZOOM,
  PAGE_BUILDER_CANVAS_ZOOM_OPTIONS,
} from "@/shared/lib/page-builder/canvas-view";
import type {
  PageBuilderPresetOption,
  PageBuilderPresetType,
} from "@/shared/lib/page-builder/presets";
import type { PageBuilderResolvedMediaMap } from "@/shared/lib/page-builder/media";
import type {
  PageBuilderBreakpoint,
  PageBuilderDocument,
  PageBuilderNode,
} from "@/shared/lib/page-builder/schema";
import type {
  FreeformPageBuilderLayoutPreview,
  FreeformPageBuilderNodeSelectOptions,
} from "@/shared/page-builder/renderer/FreeformPageRenderer";
import type { ReactElement, ReactNode } from "react";
import {
  PageBuilderCanvas,
  type PageBuilderCanvasLayoutCommit,
} from "./PageBuilderCanvas";
import { PageBuilderAssetsPanel } from "./PageBuilderAssetsPanel";
import {
  PageBuilderInsertPanel,
  type PageBuilderInsertNodeType,
  type PageBuilderInsertOption,
} from "./PageBuilderInsertPanel";
import { PageBuilderLayerTree } from "./PageBuilderLayerTree";
import { PageBuilderRevisionList } from "./PageBuilderRevisionList";

export type PageBuilderSidebarTab =
  | "insert"
  | "layers"
  | "assets"
  | "revisions";

export type PageBuilderSaveStatusMeta = {
  label: string;
  variant: "secondary" | "success" | "destructive";
  icon: "loader" | "dirty" | null;
};

type PageBuilderImageNode = Extract<PageBuilderNode, { type: "image" }>;

const CANVAS_ZOOM_OPTIONS = PAGE_BUILDER_CANVAS_ZOOM_OPTIONS.map((value) => ({
  value: String(value),
  label: `${value}%`,
})) satisfies ReadonlyArray<{
  value: string;
  label: string;
}>;

const BREAKPOINT_OPTIONS = [
  {
    value: "desktop",
    label: "Desktop",
    icon: <IconDeviceDesktop className="h-4 w-4" />,
  },
  {
    value: "tablet",
    label: "Tablet",
    icon: <IconDeviceTablet className="h-4 w-4" />,
  },
  {
    value: "mobile",
    label: "Mobile",
    icon: <IconDeviceMobile className="h-4 w-4" />,
  },
] satisfies ReadonlyArray<{
  value: PageBuilderBreakpoint;
  label: string;
  icon: ReactElement;
}>;

const RAIL_ITEMS = [
  {
    value: "insert",
    label: "Insert",
    icon: <IconPhotoPlus className="h-4 w-4" />,
  },
  {
    value: "layers",
    label: "Layers",
    icon: <IconWriting className="h-4 w-4" />,
  },
  {
    value: "assets",
    label: "Assets",
    icon: <IconPhoto className="h-4 w-4" />,
  },
  {
    value: "revisions",
    label: "Revisions",
    icon: <IconRefresh className="h-4 w-4" />,
  },
] satisfies ReadonlyArray<{
  value: PageBuilderSidebarTab;
  label: string;
  icon: ReactElement;
}>;

function parseInteger(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getWorkspaceTitle(tab: PageBuilderSidebarTab): string {
  if (tab === "insert") return "追加";
  if (tab === "layers") return "レイヤー";
  if (tab === "assets") return "アセット";
  return "履歴";
}

type BuilderRailButtonProps = {
  value: PageBuilderSidebarTab;
  label: string;
  icon: ReactElement;
  isActive: boolean;
  onSelect: (value: PageBuilderSidebarTab) => void;
};

function BuilderRailButton({
  value,
  label,
  icon,
  isActive,
  onSelect,
}: BuilderRailButtonProps): ReactElement {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={label}
      className={cn(
        "flex h-14 w-full flex-col items-center justify-center gap-1 border-l-2 text-[11px] font-medium transition-colors",
        isActive
          ? "border-primary bg-accent text-accent-foreground"
          : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
      onClick={() => onSelect(value)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

type PageBuilderEditorShellProps = {
  children: ReactNode;
};

export function PageBuilderEditorShell({
  children,
}: PageBuilderEditorShellProps): ReactElement {
  return (
    <div
      className="fixed inset-0 overflow-auto bg-background text-foreground"
      style={{ zIndex: Z_INDEX.editorFullscreen }}
    >
      <div className="flex h-full min-h-[720px] min-w-[1280px] flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

type PageBuilderTopbarProps = {
  pageTitle: string;
  pageSlug: string;
  isPublished: boolean;
  saveStatusMeta: PageBuilderSaveStatusMeta;
  hasValidationErrors: boolean;
  validationIssueCount: number;
  breakpoint: PageBuilderBreakpoint;
  canvasZoom: number;
  canUndo: boolean;
  canRedo: boolean;
  undoDisabled: boolean;
  redoDisabled: boolean;
  saveDisabled: boolean;
  publishDisabled: boolean;
  unpublishDisabled: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  isUnpublishing: boolean;
  onBreakpointChange: (breakpoint: PageBuilderBreakpoint) => void;
  onZoomStep: (direction: -1 | 1) => void;
  onZoomChange: (zoom: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
};

export function PageBuilderTopbar({
  pageTitle,
  pageSlug,
  isPublished,
  saveStatusMeta,
  hasValidationErrors,
  validationIssueCount,
  breakpoint,
  canvasZoom,
  canUndo,
  canRedo,
  undoDisabled,
  redoDisabled,
  saveDisabled,
  publishDisabled,
  unpublishDisabled,
  isSaving,
  isPublishing,
  isUnpublishing,
  onBreakpointChange,
  onZoomStep,
  onZoomChange,
  onUndo,
  onRedo,
  onSave,
  onPublish,
  onUnpublish,
}: PageBuilderTopbarProps): ReactElement {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar-bg text-sidebar-text">
      <div className="flex h-full min-w-0 items-center">
        <Link
          href="/admin/pages"
          className="flex h-14 w-14 shrink-0 items-center justify-center border-r border-sidebar-border text-xl font-bold tracking-tight hover:bg-sidebar-nav-hover"
          aria-label="ページ一覧へ戻る"
        >
          S
        </Link>
        <div className="min-w-0 px-4">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{pageTitle}</p>
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
              Freeform
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                isPublished
                  ? "bg-success/15 text-success"
                  : "bg-sidebar-border text-sidebar-text",
              )}
            >
              {isPublished ? "公開中" : "下書き"}
            </span>
          </div>
          <p className="truncate text-xs text-sidebar-text-muted">
            /{pageSlug}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-3">
        <div className="flex items-center rounded-lg border border-sidebar-border bg-sidebar-border/40 p-1">
          {BREAKPOINT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
                breakpoint === option.value
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-text-muted hover:bg-sidebar-nav-hover hover:text-sidebar-text",
              )}
              onClick={() => onBreakpointChange(option.value)}
            >
              {option.icon}
              <span className="hidden 2xl:inline">{option.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-sidebar-border bg-sidebar-border/40 p-1">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-text-muted transition-colors hover:bg-sidebar-nav-hover hover:text-sidebar-text disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="zoom out"
            onClick={() => onZoomStep(-1)}
            disabled={canvasZoom <= PAGE_BUILDER_CANVAS_MIN_ZOOM}
          >
            -
          </button>
          <Select
            value={String(canvasZoom)}
            onValueChange={(value) => {
              const parsed = parseInteger(value);
              if (parsed !== null) {
                onZoomChange(parsed);
              }
            }}
          >
            <SelectTrigger className="h-8 w-[88px] border-sidebar-border bg-sidebar-bg text-xs text-sidebar-text">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CANVAS_ZOOM_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-text-muted transition-colors hover:bg-sidebar-nav-hover hover:text-sidebar-text disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="zoom in"
            onClick={() => onZoomStep(1)}
            disabled={canvasZoom >= PAGE_BUILDER_CANVAS_MAX_ZOOM}
          >
            +
          </button>
        </div>

        <div className="flex items-center rounded-lg border border-sidebar-border bg-sidebar-border/40 p-1">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-text-muted transition-colors hover:bg-sidebar-nav-hover hover:text-sidebar-text disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="元に戻す"
            onClick={onUndo}
            disabled={!canUndo || undoDisabled}
          >
            <IconArrowBackUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-text-muted transition-colors hover:bg-sidebar-nav-hover hover:text-sidebar-text disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="やり直す"
            onClick={onRedo}
            disabled={!canRedo || redoDisabled}
          >
            <IconArrowForwardUp className="h-4 w-4" />
          </button>
        </div>

        <span
          className={cn(
            "hidden items-center rounded-full px-2.5 py-1 text-xs font-semibold xl:inline-flex",
            saveStatusMeta.variant === "success"
              ? "bg-success/15 text-success"
              : saveStatusMeta.variant === "destructive"
                ? "bg-destructive/15 text-destructive"
                : "bg-warning/15 text-warning",
          )}
        >
          {saveStatusMeta.icon === "loader" ? (
            <IconLoader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : saveStatusMeta.icon === "dirty" ? (
            <IconWriting className="mr-1.5 h-3.5 w-3.5" />
          ) : null}
          {saveStatusMeta.label}
        </span>
        {hasValidationErrors ? (
          <span className="hidden items-center rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-semibold text-destructive 2xl:inline-flex">
            <IconAlertCircle className="mr-1.5 h-3.5 w-3.5" />
            入力エラー {validationIssueCount} 件
          </span>
        ) : null}
      </div>

      <div className="flex h-full shrink-0 items-center border-l border-sidebar-border">
        <Button
          type="button"
          variant="ghost"
          className="h-full rounded-none px-4 text-sidebar-text hover:bg-sidebar-nav-hover hover:text-sidebar-text"
          asChild
        >
          <Link
            href={`/preview/pages/${pageSlug}`}
            target="_blank"
            rel="noreferrer"
          >
            <IconEye className="mr-2 h-4 w-4" />
            プレビュー
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-full rounded-none px-4 text-sidebar-text hover:bg-sidebar-nav-hover hover:text-sidebar-text"
          onClick={onSave}
          disabled={saveDisabled}
        >
          {isSaving ? (
            <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          下書きを保存
        </Button>
        {isPublished ? (
          <Button
            type="button"
            variant="ghost"
            className="h-full rounded-none px-4 text-sidebar-text hover:bg-sidebar-nav-hover hover:text-sidebar-text"
            onClick={onUnpublish}
            disabled={unpublishDisabled}
          >
            {isUnpublishing ? (
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <IconWorldOff className="mr-2 h-4 w-4" />
            )}
            非公開
          </Button>
        ) : null}
        <Button
          type="button"
          className="h-full rounded-none bg-primary px-6 text-primary-foreground hover:bg-primary/90"
          onClick={onPublish}
          disabled={publishDisabled}
        >
          {isPublishing ? (
            <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <IconWorld className="mr-2 h-4 w-4" />
          )}
          {isPublished ? "再公開" : "公開"}
        </Button>
      </div>
    </header>
  );
}

type PageBuilderSyncConflictBannerProps = {
  message: string | null;
  isReloading: boolean;
  disabled: boolean;
  onReloadLatest: () => void;
};

export function PageBuilderSyncConflictBanner({
  message,
  isReloading,
  disabled,
  onReloadLatest,
}: PageBuilderSyncConflictBannerProps): ReactElement {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
      <div className="flex min-w-0 items-center gap-2">
        <IconAlertCircle className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          このタブの builder state は古くなっています。
        </span>
        <span className="truncate text-xs">{message}</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onReloadLatest}
        disabled={disabled}
      >
        {isReloading ? (
          <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <IconRefresh className="mr-2 h-4 w-4" />
        )}
        最新を読み込む
      </Button>
    </div>
  );
}

type PageBuilderWorkspacePanelProps = {
  tab: PageBuilderSidebarTab;
  nodeCount: number;
  hasSyncConflict: boolean;
  insertOptions: readonly PageBuilderInsertOption[];
  presets: readonly PageBuilderPresetOption[];
  disabled: boolean;
  document: PageBuilderDocument;
  breakpoint: PageBuilderBreakpoint;
  selectedNodeId: string;
  selectedNodeIds: readonly string[];
  imageNodes: readonly PageBuilderImageNode[];
  mediaById: PageBuilderResolvedMediaMap;
  revisions: readonly PageBuilderRevisionSummary[];
  draftVersion: number;
  publishedVersion: number | null;
  isDirty: boolean;
  onTabChange: (tab: PageBuilderSidebarTab) => void;
  onAddNode: (type: PageBuilderInsertNodeType) => void;
  onAddPreset: (type: PageBuilderPresetType) => void;
  onSelectNode: (
    nodeId: string,
    options?: FreeformPageBuilderNodeSelectOptions,
  ) => void;
  onReorderNode: (activeNodeId: string, overNodeId: string) => void;
  onToggleNodeHidden: (nodeId: string) => void;
  onToggleNodeLocked: (nodeId: string) => void;
  onOpenImagePicker: (nodeId: string) => void;
  onClearImage: (nodeId: string) => void;
  onRequestRestore: (revisionId: string) => void;
};

export function PageBuilderWorkspacePanel({
  tab,
  nodeCount,
  hasSyncConflict,
  insertOptions,
  presets,
  disabled,
  document,
  breakpoint,
  selectedNodeId,
  selectedNodeIds,
  imageNodes,
  mediaById,
  revisions,
  draftVersion,
  publishedVersion,
  isDirty,
  onTabChange,
  onAddNode,
  onAddPreset,
  onSelectNode,
  onReorderNode,
  onToggleNodeHidden,
  onToggleNodeLocked,
  onOpenImagePicker,
  onClearImage,
  onRequestRestore,
}: PageBuilderWorkspacePanelProps): ReactElement {
  return (
    <div
      className={cn("flex w-[360px] shrink-0", hasSyncConflict && "opacity-70")}
    >
      <nav
        role="tablist"
        aria-label="Builder workspace"
        className="flex w-20 shrink-0 flex-col border-r border-border bg-card"
      >
        {RAIL_ITEMS.map((item) => (
          <BuilderRailButton
            key={item.value}
            value={item.value}
            label={item.label}
            icon={item.icon}
            isActive={tab === item.value}
            onSelect={onTabChange}
          />
        ))}
        <div className="mt-auto border-t border-border p-2 text-center text-[11px] font-medium text-muted-foreground">
          {nodeCount}
          <br />
          nodes
        </div>
      </nav>

      <aside className="flex min-w-0 flex-1 flex-col border-r border-border bg-card">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Workspace
              </p>
              <h2 className="text-base font-semibold text-foreground">
                {getWorkspaceTitle(tab)}
              </h2>
            </div>
            <Badge variant="secondary">{nodeCount} nodes</Badge>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "insert" ? (
            <PageBuilderInsertPanel
              options={insertOptions}
              presets={presets}
              disabled={disabled}
              onAddNode={onAddNode}
              onAddPreset={onAddPreset}
            />
          ) : null}
          {tab === "layers" ? (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                同じ親ノード内ではドラッグで順序変更できます。表示と lock
                は現在の breakpoint に対して保存されます。
              </p>
              <PageBuilderLayerTree
                document={document}
                breakpoint={breakpoint}
                selectedNodeId={selectedNodeId}
                selectedNodeIds={selectedNodeIds}
                onSelectNode={onSelectNode}
                onReorderNode={onReorderNode}
                onToggleNodeHidden={onToggleNodeHidden}
                onToggleNodeLocked={onToggleNodeLocked}
                disabled={disabled}
              />
            </div>
          ) : null}
          {tab === "assets" ? (
            <PageBuilderAssetsPanel
              imageNodes={imageNodes}
              mediaById={mediaById}
              selectedNodeId={selectedNodeId}
              disabled={disabled}
              onSelectNode={onSelectNode}
              onOpenImagePicker={onOpenImagePicker}
              onClearImage={onClearImage}
            />
          ) : null}
          {tab === "revisions" ? (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                復元すると現在の draft を置き換え、新しい draft revision
                を作成します。
              </p>
              <PageBuilderRevisionList
                revisions={revisions}
                draftVersion={draftVersion}
                publishedVersion={publishedVersion}
                isDirty={isDirty}
                disabled={disabled}
                onRequestRestore={onRequestRestore}
              />
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

type PageBuilderCanvasStageProps = {
  document: PageBuilderDocument;
  media: PageBuilderResolvedMediaMap;
  breakpoint: PageBuilderBreakpoint;
  breakpointWidth: number;
  selectedNodeId: string;
  selectedNodeIds: readonly string[];
  interactionDisabled: boolean;
  layoutPreviews: readonly FreeformPageBuilderLayoutPreview[];
  zoom: number;
  showGrid: boolean;
  hasSyncConflict: boolean;
  onGridVisibilityChange: (visible: boolean) => void;
  onNodeSelect: (
    nodeId: string,
    options?: FreeformPageBuilderNodeSelectOptions,
  ) => void;
  onNodesSelect: (nodeIds: readonly string[]) => void;
  onLayoutPreviewChange: (
    previews: readonly FreeformPageBuilderLayoutPreview[],
  ) => void;
  onCommitLayout: (commit: PageBuilderCanvasLayoutCommit) => void;
};

export function PageBuilderCanvasStage({
  document,
  media,
  breakpoint,
  breakpointWidth,
  selectedNodeId,
  selectedNodeIds,
  interactionDisabled,
  layoutPreviews,
  zoom,
  showGrid,
  hasSyncConflict,
  onGridVisibilityChange,
  onNodeSelect,
  onNodesSelect,
  onLayoutPreviewChange,
  onCommitLayout,
}: PageBuilderCanvasStageProps): ReactElement {
  return (
    <main
      className={cn(
        "flex min-w-0 flex-1 flex-col bg-muted",
        hasSyncConflict && "pointer-events-none opacity-60",
      )}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/80 px-5 backdrop-blur">
        <div>
          <p className="text-sm font-semibold text-foreground">Canvas</p>
          <p className="text-xs text-muted-foreground">
            {breakpoint} / {breakpointWidth}px / zoom {zoom}%
          </p>
        </div>
        <p className="hidden text-xs text-muted-foreground xl:block">
          Ctrl/Cmd+S 保存 / Ctrl/Cmd+Z Undo / Arrow 移動 / G Grid / Shift
          で吸着OFF
        </p>
        <Button
          type="button"
          variant={showGrid ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-8 shrink-0 text-xs",
            showGrid
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "border-input bg-card text-muted-foreground hover:bg-secondary",
          )}
          onClick={() => onGridVisibilityChange(!showGrid)}
        >
          {showGrid ? "Grid 8px" : "Grid off"}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <PageBuilderCanvas
          document={document}
          media={media}
          breakpoint={breakpoint}
          breakpointWidth={breakpointWidth}
          selectedNodeId={selectedNodeId}
          selectedNodeIds={selectedNodeIds}
          interactionDisabled={interactionDisabled}
          layoutPreviews={layoutPreviews}
          zoom={zoom}
          showGrid={showGrid}
          onNodeSelect={onNodeSelect}
          onNodesSelect={onNodesSelect}
          onLayoutPreviewChange={onLayoutPreviewChange}
          onCommitLayout={onCommitLayout}
        />
      </div>
    </main>
  );
}

type PageBuilderInspectorPanelProps = {
  nodeName: string;
  nodeTypeLabel: string;
  breakpoint: PageBuilderBreakpoint;
  hasSyncConflict: boolean;
  children: ReactNode;
};

export function PageBuilderInspectorPanel({
  nodeName,
  nodeTypeLabel,
  breakpoint,
  hasSyncConflict,
  children,
}: PageBuilderInspectorPanelProps): ReactElement {
  return (
    <aside
      className={cn(
        "flex w-[380px] shrink-0 flex-col border-l border-border bg-card",
        hasSyncConflict && "pointer-events-none opacity-60",
      )}
    >
      <div className="shrink-0 border-b border-border px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Inspector
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">
              {nodeName}
            </h2>
            <p className="text-xs text-muted-foreground">{nodeTypeLabel}</p>
          </div>
          <Badge variant="secondary">{breakpoint}</Badge>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {children}
      </div>
    </aside>
  );
}
