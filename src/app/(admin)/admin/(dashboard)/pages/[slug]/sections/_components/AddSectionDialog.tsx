"use client";

/**
 * セクション追加ダイアログ
 *
 * レジストリからセクション定義を取得してカテゴリ別に表示
 */

import "@/admin/lib/sections/register-admin-sections";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/admin/components/ui";
import { getAdminSectionsByCategory } from "@/shared/lib/sections/admin-registry";
import type { SectionCategory } from "@/shared/lib/sections/types";
import { renderSectionIcon } from "@/admin/components/section-icon-resolver";

const CATEGORY_LABELS: Record<SectionCategory, string> = {
  hero: "ヒーロー",
  content: "コンテンツ",
  list: "一覧表示",
  interactive: "CTA・フォーム",
  media: "メディア・埋め込み",
  utility: "ユーティリティ",
};

interface AddSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (componentId: string) => void;
  disabled: boolean;
}

export function AddSectionDialog({
  open,
  onOpenChange,
  onAdd,
  disabled,
}: AddSectionDialogProps) {
  const groups = getAdminSectionsByCategory();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle>セクションを追加</AlertDialogTitle>
          <AlertDialogDescription>
            ページに追加するセクションタイプを選択
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-5 py-4 overflow-y-auto">
          {groups.map(({ category, sections }) => (
            <div key={category}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {CATEGORY_LABELS[category] ?? category}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {sections.map((definition) => (
                    <button
                      key={definition.id}
                      type="button"
                      onClick={() => {
                        onAdd(definition.id);
                        onOpenChange(false);
                      }}
                      disabled={disabled}
                      className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="p-2 rounded-md bg-primary/10 shrink-0">
                        {renderSectionIcon(definition.meta.icon, "h-5 w-5 text-primary")}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">{definition.meta.label}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {definition.meta.description}
                        </p>
                      </div>
                    </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
