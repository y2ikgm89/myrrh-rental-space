"use client";

/**
 * セクション管理 マスターディテール レイアウト
 *
 * 左: セクション一覧（DnD） + SEOリンク
 * 右: 設定パネル（コンテンツ/デザイン タブ）
 *
 * 状態:
 * - sections: useEffect で初期ロード、ミューテーション後リロード
 * - selectedId: nuqs URL状態 (?section=<id>)
 * - showAddDialog: セクション追加ダイアログ
 */

import { useState, useEffect, useRef, useTransition } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { cn } from "@/shared/lib/utils";
import {
  getPageSections,
  updatePageSectionOrder,
  togglePageSection,
  deletePageSection,
  duplicatePageSection,
  createPageSection,
  type PageSectionData,
} from "@/admin/actions/page-section";
import type { PageForEdit } from "@/admin/actions/page-section";
import {
  SectionType,
  defaultSectionConfigs,
} from "@/shared/lib/validations/section";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { SectionSidebar, SEO_SELECTION_ID } from "./SectionSidebar";
import { SectionDetailPanel } from "./SectionDetailPanel";
import { PageSeoForm } from "../../seo/_components/PageSeoForm";
import { AddSectionDialog } from "../../sections/_components/AddSectionDialog";

interface SectionMasterDetailProps {
  page: PageForEdit;
}

export function SectionMasterDetail({ page }: SectionMasterDetailProps) {
  const [isPending, startTransition] = useTransition();
  const [sections, setSections] = useState<PageSectionData[] | null>(null);
  const [selectedId, setSelectedId] = useQueryState("section", parseAsString);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dirty state guard
  const confirm = useConfirm();
  const isDirtyRef = useRef(false);
  const handleDirtyChange = (dirty: boolean) => {
    isDirtyRef.current = dirty;
  };

  // Mobile responsive: list/detail toggle
  const [showMobileList, setShowMobileList] = useState(true);
  // =========================================================================
  // Data Loading
  // =========================================================================

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getPageSections(page.id);
        if (!cancelled) {
          const sectionList = data ?? [];
          setSections(sectionList);
          // 初回ロード: セクションがあり未選択なら最初を自動選択
          const firstSection = sectionList[0];
          if (!selectedId && firstSection) {
            setSelectedId(firstSection.id);
          }
        }
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
  }, [page.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = undoTimerRef.current;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  function reloadSections() {
    getPageSections(page.id)
      .then((data) => setSections(data ?? []))
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

  const selectedSection = sections?.find((s) => s.id === selectedId) ?? null;

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
      if (result.success) {
        toast.success(result.message);
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
            if (!result.success) {
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
      if (result.success) {
        toast.success(result.message);
        // リロードして新しいセクションを取得 & 自動選択
        const data = await getPageSections(page.id);
        const sectionList = data ?? [];
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

  function handleAddSection(type: SectionType) {
    startTransition(async () => {
      const result = await createPageSection({
        pageId: page.id,
        type,
        config: defaultSectionConfigs[type],
        design: {},
        isActive: true,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      // リロードして新しいセクションを自動選択
      const data = await getPageSections(page.id);
      const sectionList = data ?? [];
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
      if (!result.success) {
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
      <div className="flex flex-col lg:grid lg:grid-cols-[320px_1fr] gap-6 h-auto lg:h-[calc(100vh-220px)]">
        <div className="space-y-2 p-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  // =========================================================================
  // Render
  // =========================================================================

  const isSeoSelected = selectedId === SEO_SELECTION_ID;

  return (
    <>
      <div className="flex flex-col lg:grid lg:grid-cols-[320px_1fr] gap-0 h-auto lg:h-[calc(100vh-220px)]">
        {/* Left Sidebar */}
        <div
          className={cn(
            "border-b lg:border-b-0 lg:border-r overflow-hidden",
            "lg:block",
            showMobileList ? "flex-1" : "hidden",
          )}
        >
          <SectionSidebar
            sections={sections}
            selectedId={selectedId}
            onSelect={handleSelect}
            onReorder={handleReorder}
            onToggle={handleToggle}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onAddSection={() => setShowAddDialog(true)}
            disabled={isPending}
          />
        </div>

        {/* Right Detail Panel */}
        <div
          className={cn(
            "overflow-y-auto px-4 py-4 lg:px-6",
            "lg:block",
            showMobileList ? "hidden" : "flex-1",
          )}
        >
          {/* Mobile back button */}
          <MobileBackButton onClick={handleBackToList} />

          {isSeoSelected ? (
            <PageSeoForm page={page} />
          ) : (
            <SectionDetailPanel
              section={selectedSection}
              hasSections={sections.length > 0}
              onAddSection={() => setShowAddDialog(true)}
              onSectionUpdated={handleSectionUpdated}
              onDirtyChange={handleDirtyChange}
            />
          )}
        </div>
      </div>

      {/* Add Section Dialog */}
      <AddSectionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddSection}
        disabled={isPending}
      />
    </>
  );
}

// =============================================================================
// Mobile Back Button (inline)
// =============================================================================

function MobileBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 lg:hidden"
    >
      <ArrowLeft className="h-4 w-4" />
      セクション一覧
    </button>
  );
}
