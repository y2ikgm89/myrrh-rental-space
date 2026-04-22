"use client";

/**
 * セクション管理 マスターディテール レイアウト
 *
 * ページレベルタブ: [セクション | ページ設定]
 * セクションタブ: 左サイドバー（DnD一覧） + 右設定パネル
 * ページ設定タブ: SEOフォーム
 *
 * 状態:
 * - sections: props 初期値 + API リロード
 * - selectedId: nuqs URL状態 (?section=<id>)
 * - pageTab: nuqs URL状態 (?tab=sections|settings)
 * - showAddDialog: セクション追加ダイアログ
 */

import { useState, useEffect, useRef, useTransition } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { toast } from "sonner";
import { IconArrowLeft } from "@tabler/icons-react";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import { cn } from "@/shared/lib/cn";
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
import { PageSeoForm } from "../../_seo/_components/PageSeoForm";
import { AddSectionDialog } from "../../_sections/_components/AddSectionDialog";

const TAB_SECTIONS = "sections";
const TAB_HERO = "hero";
const TAB_SETTINGS = "settings";

function normalizePageTab(slug: string, raw: string | null): string {
  const v = raw ?? TAB_SECTIONS;
  if (v === TAB_HERO && slug !== "home") {
    return TAB_SECTIONS;
  }
  if (v !== TAB_SECTIONS && v !== TAB_SETTINGS && v !== TAB_HERO) {
    return TAB_SECTIONS;
  }
  return v;
}

interface SectionMasterDetailProps {
  page: PageForEdit;
}

async function fetchPageSections(pageId: string): Promise<PageSectionData[]> {
  const searchParams = new URLSearchParams({ pageId });
  return fetchAdminJson(`/admin/api/page-sections?${searchParams.toString()}`);
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

  const [pageTabRaw, setPageTabRaw] = useQueryState(
    "tab",
    parseAsString.withDefault(TAB_SECTIONS).withOptions({
      history: "push",
      shallow: true,
    }),
  );
  const pageTab = normalizePageTab(page.slug, pageTabRaw);

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dirty state guard
  const confirm = useConfirm();
  const isDirtyRef = useRef(false);
  const handleDirtyChange = (dirty: boolean) => {
    isDirtyRef.current = dirty;
  };

  // Mobile responsive: list/detail toggle
  const [showMobileList, setShowMobileList] = useState(true);
  useEffect(() => {
    const timer = undoTimerRef.current;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  function reloadSections() {
    fetchPageSections(page.id)
      .then((data) => setSections(data))
      .catch(() => {
        /* best-effort */
      });
  }

  // =========================================================================
  // Selection
  // =========================================================================

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
    setShowMobileList(false);
  }

  function handleBackToList() {
    setShowMobileList(true);
  }

  const effectiveSelectedId = selectedId ?? sections?.[0]?.id ?? null;
  const selectedSection =
    sections?.find((s) => s.id === effectiveSelectedId) ?? null;

  // =========================================================================
  // Section CRUD
  // =========================================================================

  function handleToggle(id: string, isActive: boolean) {
    setSections(
      (prev) =>
        prev?.map((s) => (s.id === id ? { ...s, isActive } : s)) ?? null,
    );
    startTransition(async () => {
      const result = await togglePageSection(id, isActive);
      if (!isMutationError(result)) {
        toast.success("更新しました");
      } else {
        toast.error(result.error);
        reloadSections();
      }
    });
  }

  function handleDelete(id: string) {
    const deletedSection = sections?.find((s) => s.id === id);
    if (!deletedSection) return;

    // Optimistic remove
    setSections((prev) => prev?.filter((s) => s.id !== id) ?? null);

    // 選択中のセクションが削除された場合、次のセクションを選択
    if (selectedId === id) {
      const remaining = sections?.filter((s) => s.id !== id) ?? [];
      const deletedIndex = sections?.findIndex((s) => s.id === id) ?? 0;
      const nextIndex = Math.min(deletedIndex, remaining.length - 1);
      const nextSection = remaining[nextIndex];
      if (nextSection) {
        setSelectedId(nextSection.id);
      } else {
        setSelectedId(null);
      }
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
            restored.sort((a, b) => a.order - b.order);
            return restored;
          });
          // 元に戻したらそのセクションを選択
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
            }
          });
        }
      },
    });
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const result = await duplicatePageSection(id);
      if (!isMutationError(result)) {
        toast.success("複製しました");
        // リロードして新しいセクションを取得 & 自動選択
        const sectionList = await fetchPageSections(page.id);
        setSections(sectionList);
        // 複製されたセクションは末尾に追加されるので最後を選択
        const lastSection = sectionList[sectionList.length - 1];
        if (lastSection) {
          setSelectedId(lastSection.id);
          setShowMobileList(false);
        }
      } else {
        toast.error(result.error);
      }
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
        design: {},
        isActive: true,
        ...(insertAtIndex !== undefined && { order: insertAtIndex }),
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("追加しました");
      setInsertAtIndex(undefined);
      // リロードして新しいセクションを自動選択
      const sectionList = await fetchPageSections(page.id);
      setSections(sectionList);
      const lastNewSection = sectionList[sectionList.length - 1];
      if (lastNewSection) {
        setSelectedId(lastNewSection.id);
        setShowMobileList(false);
      }
    });
  }

  function handleReorder(reordered: PageSectionData[]) {
    const orderUpdates = reordered.map((s, index) => ({
      id: s.id,
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
      }
    });
  }

  function handleSectionUpdated() {
    reloadSections();
  }

  // =========================================================================
  // Loading
  // =========================================================================

  if (sections === null) {
    return (
      <div className="flex flex-col lg:grid lg:grid-cols-[280px_1fr] gap-6 h-auto lg:h-[calc(100vh-220px)]">
        <div className="space-y-2 p-3 w-full lg:w-[280px]">
          <div className="h-8 animate-pulse rounded-md bg-muted" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <>
      <Tabs
        value={pageTab}
        onValueChange={(v) => {
          void setPageTabRaw(normalizePageTab(page.slug, v));
        }}
      >
        <TabsList className="mb-2">
          <TabsTrigger value={TAB_SECTIONS}>セクション</TabsTrigger>
          {page.slug === "home" ? (
            <TabsTrigger value={TAB_HERO}>ヒーロー</TabsTrigger>
          ) : null}
          <TabsTrigger value={TAB_SETTINGS}>ページ設定</TabsTrigger>
        </TabsList>

        <TabsContent
          value={TAB_SECTIONS}
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <div className="flex flex-col lg:grid lg:grid-cols-[280px_1fr] gap-0 h-auto lg:h-[calc(100vh-280px)]">
            {/* Left Sidebar */}
            <div
              className={cn(
                "border-b lg:border-b-0 lg:border-r overflow-hidden",
                "lg:block",
                showMobileList ? "flex-1" : "hidden",
              )}
            >
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

            {/* Right Detail Panel */}
            <div
              className={cn(
                "overflow-y-auto p-4",
                "lg:block",
                showMobileList ? "hidden" : "flex-1",
              )}
            >
              <button
                type="button"
                onClick={handleBackToList}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 lg:hidden"
              >
                <IconArrowLeft className="h-4 w-4" />
                セクション一覧
              </button>
              <SectionEditor
                section={selectedSection}
                hasSections={sections.length > 0}
                onAddSection={() => handleOpenAddDialog()}
                onSectionUpdated={handleSectionUpdated}
                onDirtyChange={handleDirtyChange}
              />
            </div>
          </div>
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
              onSaved={() => {
                /* ヒーローは Section 一覧と独立 */
              }}
              onDirtyChange={handleDirtyChange}
            />
          </TabsContent>
        ) : null}

        <TabsContent
          value={TAB_SETTINGS}
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <PageSeoForm page={page} />
        </TabsContent>
      </Tabs>

      <AddSectionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddSection}
        disabled={isPending}
      />
    </>
  );
}
