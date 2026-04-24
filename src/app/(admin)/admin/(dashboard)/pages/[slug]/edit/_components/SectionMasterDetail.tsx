"use client";

/**
 * ページ編集ワークスペース
 *
 * 旧来の master-detail ではなく、以下の 3 面構成を正本にする:
 * - navigator: セクション構成と並び替え
 * - canvas: 本番ルート相当のプレビュー
 * - inspector: 選択中セクション / ページ設定 / home ヒーロー設定
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { toast } from "sonner";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { useAdminLayout } from "@/admin/contexts/admin-layout-context";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import {
  updatePageSectionOrder,
  togglePageSection,
  deletePageSection,
  duplicatePageSection,
  createPageSection,
} from "@/admin/actions/page-section";
import type {
  PageForEdit,
  PageSectionData,
} from "@/admin/queries/page-section";
import { getDefaultSectionConfig } from "@/shared/lib/validations/section-defaults";
import { isSectionType } from "@/shared/lib/validations/section";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/admin/components/ui";
import { SectionList } from "./SectionList";
import { SectionEditor } from "./SectionEditor";
import { PageHeroEditor } from "./PageHeroEditor";
import { PageStyleField } from "./PageStyleField";
import { PageLivePreview } from "./PageLivePreview";
import { PageSeoForm } from "../../_seo/_components/PageSeoForm";
import { AddSectionDialog } from "../../_sections/_components/AddSectionDialog";

const VIEW_CANVAS = "canvas";
const VIEW_NAVIGATOR = "navigator";
const VIEW_INSPECTOR = "inspector";

const TAB_SECTION = "section";
const TAB_HERO = "hero";
const TAB_PAGE = "page";

type WorkspaceView =
  | typeof VIEW_CANVAS
  | typeof VIEW_NAVIGATOR
  | typeof VIEW_INSPECTOR;

function normalizeWorkspaceView(raw: string): WorkspaceView {
  if (raw === VIEW_NAVIGATOR || raw === VIEW_INSPECTOR) {
    return raw;
  }

  return VIEW_CANVAS;
}

function normalizeInspectorTab(slug: string, raw: string | null): string {
  const value = raw ?? TAB_SECTION;

  if (value === TAB_HERO) {
    return slug === "home" ? TAB_HERO : TAB_SECTION;
  }

  if (value === TAB_PAGE || value === "settings") {
    return TAB_PAGE;
  }

  return TAB_SECTION;
}

function getDesktopTemplateColumns(
  navigatorOpen: boolean,
  inspectorOpen: boolean,
): string {
  const columns = [];

  if (navigatorOpen) {
    columns.push("minmax(280px,320px)");
  }

  columns.push("minmax(0,1fr)");

  if (inspectorOpen) {
    columns.push("minmax(360px,440px)");
  }

  return columns.join(" ");
}

interface SectionMasterDetailProps {
  page: PageForEdit;
}

interface InspectorPanelProps {
  readonly page: PageForEdit;
  readonly inspectorTab: string;
  readonly selectedSection: PageSectionData | null;
  readonly hasSections: boolean;
  readonly onInspectorTabChange: (value: string) => void;
  readonly onAddSection: () => void;
  readonly onSectionUpdated: () => void;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onPreviewRefresh: () => void;
}

async function fetchPageSections(pageId: string): Promise<PageSectionData[]> {
  const searchParams = new URLSearchParams({ pageId });
  return fetchAdminJson(`/admin/api/page-sections?${searchParams.toString()}`);
}

function InspectorPanel({
  page,
  inspectorTab,
  selectedSection,
  hasSections,
  onInspectorTabChange,
  onAddSection,
  onSectionUpdated,
  onDirtyChange,
  onPreviewRefresh,
}: InspectorPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-border/70 bg-background/85">
      <div className="border-b border-border/70 px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
          Inspector
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          選択中の要素、ページ設定、ヒーロー設定をここで切り替えます。
        </p>
      </div>

      <Tabs
        value={inspectorTab}
        onValueChange={onInspectorTabChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="px-4 pt-3">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value={TAB_SECTION}>セクション</TabsTrigger>
            {page.slug === "home" ? (
              <TabsTrigger value={TAB_HERO}>ヒーロー</TabsTrigger>
            ) : null}
            <TabsTrigger value={TAB_PAGE}>ページ</TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent
            value={TAB_SECTION}
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <SectionEditor
              key={selectedSection?.id ?? "none"}
              section={selectedSection}
              hasSections={hasSections}
              onAddSection={onAddSection}
              onSectionUpdated={onSectionUpdated}
              onDirtyChange={onDirtyChange}
            />
          </TabsContent>

          {page.slug === "home" ? (
            <TabsContent
              value={TAB_HERO}
              forceMount
              className="data-[state=inactive]:hidden"
            >
              <PageHeroEditor
                pageSlug={page.slug}
                initial={page.pageHero}
                onSaved={onPreviewRefresh}
                onDirtyChange={onDirtyChange}
              />
            </TabsContent>
          ) : null}

          <TabsContent
            value={TAB_PAGE}
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <div className="space-y-6">
              <PageStyleField
                pageSlug={page.slug}
                initialPageStyleId={page.pageStyleId}
                onSaved={onPreviewRefresh}
              />
              <PageSeoForm page={page} />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export function SectionMasterDetail({ page }: SectionMasterDetailProps) {
  const [isPending, startTransition] = useTransition();
  const [sections, setSections] = useState<PageSectionData[] | null>(
    page.sections,
  );
  const [selectedId, setSelectedId] = useQueryState(
    "section",
    parseAsString.withOptions({ history: "push", shallow: false }),
  );
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [insertAtIndex, setInsertAtIndex] = useState<number | undefined>();
  const [previewRevision, setPreviewRevision] = useState(0);
  const [workspaceView, setWorkspaceView] =
    useState<WorkspaceView>(VIEW_CANVAS);
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const [inspectorTabRaw, setInspectorTabRaw] = useQueryState(
    "tab",
    parseAsString.withDefault(TAB_SECTION).withOptions({
      history: "push",
      shallow: true,
    }),
  );
  const inspectorTab = normalizeInspectorTab(page.slug, inspectorTabRaw);

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirm = useConfirm();
  const { isFullscreen, enterFullscreen, exitFullscreen } = useAdminLayout();
  const isDirtyRef = useRef(false);

  const handleDirtyChange = (dirty: boolean) => {
    isDirtyRef.current = dirty;
  };

  useEffect(() => {
    const timer = undoTimerRef.current;
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => () => exitFullscreen(), [exitFullscreen]);

  function reloadSections() {
    fetchPageSections(page.id)
      .then((data) => setSections(data))
      .catch(() => {
        /* best-effort */
      });
  }

  function refreshPreview() {
    setPreviewRevision((current) => current + 1);
  }

  async function handleSelect(id: string) {
    if (isDirtyRef.current) {
      const confirmed = await confirm({
        title: "未保存の変更があります",
        description: "変更を破棄して移動しますか？",
        confirmLabel: "破棄して移動",
        variant: "destructive",
      });
      if (!confirmed) return;
    }

    setSelectedId(id);
    setWorkspaceView(VIEW_INSPECTOR);
    setInspectorOpen(true);
    void setInspectorTabRaw(TAB_SECTION);
  }

  const effectiveSelectedId = selectedId ?? sections?.[0]?.id ?? null;
  const selectedSection =
    sections?.find((section) => section.id === effectiveSelectedId) ?? null;

  function handleToggle(id: string, isActive: boolean) {
    setSections(
      (prev) =>
        prev?.map((section) =>
          section.id === id ? { ...section, isActive } : section,
        ) ?? null,
    );

    startTransition(async () => {
      const result = await togglePageSection(id, isActive);
      if (!isMutationError(result)) {
        toast.success("更新しました");
        refreshPreview();
        return;
      }

      toast.error(result.error);
      reloadSections();
    });
  }

  function handleDelete(id: string) {
    const deletedSection = sections?.find((section) => section.id === id);
    if (!deletedSection) return;

    setSections((prev) => prev?.filter((section) => section.id !== id) ?? null);

    if (selectedId === id) {
      const remaining = sections?.filter((section) => section.id !== id) ?? [];
      const deletedIndex =
        sections?.findIndex((section) => section.id === id) ?? 0;
      const nextIndex = Math.min(deletedIndex, remaining.length - 1);
      const nextSection = remaining[nextIndex];
      setSelectedId(nextSection?.id ?? null);
    }

    let undone = false;
    const toastId = toast("セクションを削除しました", {
      action: {
        label: "元に戻す",
        onClick: () => {
          undone = true;
          setSections((prev) => {
            if (!prev) return [deletedSection];
            const restored = [...prev, deletedSection];
            restored.sort((left, right) => left.order - right.order);
            return restored;
          });
          setSelectedId(deletedSection.id);
          toast.dismiss(toastId);
        },
      },
      duration: 5000,
      onDismiss: () => {
        if (!undone) {
          startTransition(async () => {
            const result = await deletePageSection(id);
            if (isMutationError(result)) {
              toast.error(result.error);
              reloadSections();
              return;
            }

            refreshPreview();
          });
        }
      },
    });
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicatePageSection(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("複製しました");
      const sectionList = await fetchPageSections(page.id);
      setSections(sectionList);
      setSelectedId(result.id);
      setWorkspaceView(VIEW_INSPECTOR);
      setInspectorOpen(true);
      void setInspectorTabRaw(TAB_SECTION);
      refreshPreview();
    });
  }

  function handleOpenAddDialog(insertIndex?: number) {
    setInsertAtIndex(insertIndex);
    setShowAddDialog(true);
  }

  function handleAddSection(type: string) {
    startTransition(async () => {
      if (!isSectionType(type)) return;

      const result = await createPageSection({
        pageId: page.id,
        type,
        config: getDefaultSectionConfig(type) ?? {},
        isActive: true,
        ...(insertAtIndex !== undefined && { order: insertAtIndex }),
      });

      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("追加しました");
      setInsertAtIndex(undefined);
      const sectionList = await fetchPageSections(page.id);
      setSections(sectionList);
      setSelectedId(result.id);
      setWorkspaceView(VIEW_INSPECTOR);
      setInspectorOpen(true);
      void setInspectorTabRaw(TAB_SECTION);
      refreshPreview();
    });
  }

  function handleReorder(reordered: PageSectionData[]) {
    const orderUpdates = reordered.map((section, index) => ({
      id: section.id,
      order: index,
    }));
    setSections(reordered);

    startTransition(async () => {
      const result = await updatePageSectionOrder(page.id, {
        sections: orderUpdates,
      });

      if (isMutationError(result)) {
        toast.error(result.error);
        reloadSections();
        return;
      }

      refreshPreview();
    });
  }

  function handleSectionUpdated() {
    reloadSections();
    refreshPreview();
  }

  function handleFocusModeToggle() {
    if (isFullscreen) {
      exitFullscreen();
      return;
    }

    enterFullscreen();
  }

  if (sections === null) {
    return (
      <div className="rounded-[28px] border border-border/70 bg-background/90 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_400px]">
          <div className="h-[70vh] animate-pulse rounded-[24px] bg-muted" />
          <div className="h-[70vh] animate-pulse rounded-[24px] bg-muted" />
          <div className="h-[70vh] animate-pulse rounded-[24px] bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-[28px] border border-border/70 bg-gradient-to-br from-background via-background to-muted/20 shadow-sm">
        <div className="border-b border-border/70 px-5 py-4">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
                Page Workspace
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">
                  編集キャンバス
                </h2>
                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                  /{page.slug}
                </span>
                <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {sections.length} sections
                </span>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                構成、プレビュー、編集を同時に扱うページ編集ワークスペースです。右の狭い補助欄ではなく、
                canvas を中心に判断できるように画面構造を組み替えています。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border bg-background/80 px-2.5 py-1">
                Navigator / Canvas / Inspector
              </span>
              <span className="rounded-full border border-border bg-background/80 px-2.5 py-1">
                保存後に preview を更新
              </span>
              <span className="rounded-full border border-border bg-background/80 px-2.5 py-1">
                Focus mode 対応
              </span>
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          <div className="lg:hidden">
            <Tabs
              value={workspaceView}
              onValueChange={(value) =>
                setWorkspaceView(normalizeWorkspaceView(value))
              }
            >
              <TabsList className="mb-3 w-full justify-start overflow-x-auto">
                <TabsTrigger value={VIEW_CANVAS}>Canvas</TabsTrigger>
                <TabsTrigger value={VIEW_NAVIGATOR}>構成</TabsTrigger>
                <TabsTrigger value={VIEW_INSPECTOR}>Inspector</TabsTrigger>
              </TabsList>

              <TabsContent
                value={VIEW_CANVAS}
                forceMount
                className="data-[state=inactive]:hidden"
              >
                <PageLivePreview
                  slug={page.slug}
                  revision={previewRevision}
                  compact
                  isFocusMode={isFullscreen}
                  onFocusModeToggle={handleFocusModeToggle}
                />
              </TabsContent>

              <TabsContent
                value={VIEW_NAVIGATOR}
                forceMount
                className="data-[state=inactive]:hidden"
              >
                <div className="overflow-hidden rounded-[24px] border border-border/70 bg-background/85">
                  <SectionList
                    sections={sections}
                    selectedId={effectiveSelectedId}
                    onSelect={handleSelect}
                    onReorder={handleReorder}
                    onToggle={handleToggle}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDelete}
                    onAddSection={handleOpenAddDialog}
                    disabled={isPending}
                  />
                </div>
              </TabsContent>

              <TabsContent
                value={VIEW_INSPECTOR}
                forceMount
                className="data-[state=inactive]:hidden"
              >
                <InspectorPanel
                  page={page}
                  inspectorTab={inspectorTab}
                  selectedSection={selectedSection}
                  hasSections={sections.length > 0}
                  onInspectorTabChange={(value) =>
                    void setInspectorTabRaw(
                      normalizeInspectorTab(page.slug, value),
                    )
                  }
                  onAddSection={() => handleOpenAddDialog()}
                  onSectionUpdated={handleSectionUpdated}
                  onDirtyChange={handleDirtyChange}
                  onPreviewRefresh={refreshPreview}
                />
              </TabsContent>
            </Tabs>
          </div>

          <div
            className="hidden min-h-[calc(100vh-18rem)] gap-4 lg:grid"
            style={{
              gridTemplateColumns: getDesktopTemplateColumns(
                navigatorOpen,
                inspectorOpen,
              ),
            }}
          >
            {navigatorOpen ? (
              <aside className="min-h-0 overflow-hidden rounded-[24px] border border-border/70 bg-background/85">
                <SectionList
                  sections={sections}
                  selectedId={effectiveSelectedId}
                  onSelect={handleSelect}
                  onReorder={handleReorder}
                  onToggle={handleToggle}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onAddSection={handleOpenAddDialog}
                  disabled={isPending}
                />
              </aside>
            ) : null}

            <div className="min-w-0">
              <PageLivePreview
                slug={page.slug}
                revision={previewRevision}
                navigatorOpen={navigatorOpen}
                inspectorOpen={inspectorOpen}
                onNavigatorToggle={() => setNavigatorOpen((prev) => !prev)}
                onInspectorToggle={() => setInspectorOpen((prev) => !prev)}
                isFocusMode={isFullscreen}
                onFocusModeToggle={handleFocusModeToggle}
              />
            </div>

            {inspectorOpen ? (
              <aside className="min-h-0 overflow-hidden">
                <InspectorPanel
                  page={page}
                  inspectorTab={inspectorTab}
                  selectedSection={selectedSection}
                  hasSections={sections.length > 0}
                  onInspectorTabChange={(value) =>
                    void setInspectorTabRaw(
                      normalizeInspectorTab(page.slug, value),
                    )
                  }
                  onAddSection={() => handleOpenAddDialog()}
                  onSectionUpdated={handleSectionUpdated}
                  onDirtyChange={handleDirtyChange}
                  onPreviewRefresh={refreshPreview}
                />
              </aside>
            ) : null}
          </div>
        </div>
      </div>

      <AddSectionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddSection}
        disabled={isPending}
      />
    </>
  );
}
