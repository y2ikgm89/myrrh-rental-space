"use client";

/**
 * SectionListSidebar — 編集ページのセクション一覧サイドバー
 *
 * D2 段階: drag handle は UI のみ（DnD 配線なし）。D6 で dnd-kit を配線して
 * `reorderPageSections` Server Action を呼び出す。
 *
 * - 追加ボタンで `onAddClick`（親で AddSectionDialog を開く）
 * - 各 item で toggle / duplicate / delete を `togglePageSectionActive` /
 *   `duplicatePageSection` / `deletePageSection` Server Action 経由で呼び出す
 * - page-hero（order=-1 固定）は `canDuplicate=false` / `canDelete=false`
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import {
  deletePageSection,
  duplicatePageSection,
  togglePageSectionActive,
} from "@/admin/actions/page-section";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { PageSectionData } from "@/admin/actions/page-section-types";
import { SectionListItem } from "./SectionListItem";

interface SectionListSidebarProps {
  readonly sections: readonly PageSectionData[];
  readonly activeSectionId: string;
  readonly onSelect: (id: string) => void;
  readonly onAddClick: () => void;
}

export function SectionListSidebar({
  sections,
  activeSectionId,
  onSelect,
  onAddClick,
}: SectionListSidebarProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

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
          sections.map((section) => {
            const isPageHero = section.type === "page-hero";
            return (
              <SectionListItem
                key={section.id}
                section={section}
                isActive={section.id === activeSectionId}
                onClick={() => onSelect(section.id)}
                onToggleActive={() => handleToggle(section.id)}
                onDuplicate={() => handleDuplicate(section.id)}
                onDelete={() => handleDelete(section.id)}
                canDuplicate={!isPageHero}
                canDelete={!isPageHero}
                canDrag={!isPageHero}
              />
            );
          })
        )}
      </div>
    </aside>
  );
}
