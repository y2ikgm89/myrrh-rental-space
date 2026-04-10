"use client";

/**
 * セクション間 inserter — ホバーで表示される「+」ボタン
 * Squarespace パターン: セクション間に挿入位置を指定して追加
 */

import { IconPlus } from "@tabler/icons-react";

interface SectionInserterProps {
  onInsert: () => void;
  disabled: boolean;
}

export function SectionInserter({ onInsert, disabled }: SectionInserterProps) {
  return (
    <div className="group/inserter relative flex items-center justify-center py-0.5">
      <div className="absolute inset-x-3 h-px bg-border opacity-0 transition-opacity group-hover/inserter:opacity-100" />
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onInsert();
        }}
        className="relative z-10 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 transition-opacity hover:border-primary hover:bg-primary/5 hover:text-primary disabled:pointer-events-none group-hover/inserter:opacity-100"
      >
        <IconPlus className="h-3 w-3" />
      </button>
    </div>
  );
}
