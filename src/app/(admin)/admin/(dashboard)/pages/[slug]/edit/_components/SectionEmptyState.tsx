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
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <IconPointer className="h-6 w-6 text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground">
        {hasSections
          ? "セクションを選択して編集"
          : "セクションを追加して始めましょう"}
      </p>
      {!hasSections && (
        <Button
          onClick={onAddSection}
          variant="outline"
          size="sm"
          className="mt-4"
        >
          <IconPlus className="h-3.5 w-3.5 mr-1.5" />
          追加
        </Button>
      )}
    </div>
  );
}
