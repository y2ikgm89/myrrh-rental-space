"use client";

/**
 * セクション未選択 / セクションなし時の空状態表示
 */

import { Button } from "@/admin/components/ui";
import { IconPlus, IconPointer } from "@tabler/icons-react";

interface SectionEmptyStateProps {
  hasSections: boolean;
  onAddSection: () => void;
}

export function SectionEmptyState({
  hasSections,
  onAddSection,
}: SectionEmptyStateProps) {
  if (!hasSections) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <IconPlus className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">
          セクションがありません
        </p>
        <p className="text-xs text-muted-foreground mb-5">
          セクションを追加してページを構築しましょう
        </p>
        <Button onClick={onAddSection} variant="default" size="sm">
          <IconPlus className="h-3.5 w-3.5 mr-1.5" />
          セクションを追加
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <IconPointer className="h-8 w-8 text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground">
        左のリストからセクションを選択してください
      </p>
    </div>
  );
}
