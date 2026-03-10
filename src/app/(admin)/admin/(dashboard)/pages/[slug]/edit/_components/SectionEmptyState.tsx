"use client";

/**
 * セクション未選択時 / セクションなし時の空状態表示
 */

import { Button } from "@/admin/components/ui";
import { LayoutTemplate, MousePointerClick, Plus } from "lucide-react";

interface SectionEmptyStateProps {
  hasSections: boolean;
  onAddSection: () => void;
}

export function SectionEmptyState({
  hasSections,
  onAddSection,
}: SectionEmptyStateProps) {
  if (hasSections) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-4 rounded-full bg-muted/50 mb-4">
          <MousePointerClick className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">セクションを選択</h3>
        <p className="text-muted-foreground max-w-sm">
          左のリストからセクションを選択して、コンテンツやデザインを編集しましょう
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="p-4 rounded-full bg-muted/50 mb-4">
        <LayoutTemplate className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">セクションがありません</h3>
      <p className="text-muted-foreground mb-6 max-w-sm">
        ページにセクションを追加して、コンテンツを構成しましょう
      </p>
      <Button onClick={onAddSection}>
        <Plus className="h-4 w-4 mr-2" />
        セクションを追加
      </Button>
    </div>
  );
}
