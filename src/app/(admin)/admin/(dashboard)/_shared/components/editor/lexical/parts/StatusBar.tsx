/**
 * Editor Status Bar
 *
 * @description エディタ下部のステータスバー（文字数・読了目安・保存状態）
 */

"use client";

import type { WordCountData } from "../plugins/WordCountPlugin";
import type { SaveStatus } from "../plugins/AutoSavePlugin";

// =============================================================================
// Constants
// =============================================================================

const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  idle: "",
  saving: "保存中...",
  saved: "保存済み",
  unsaved: "未保存の変更あり",
  error: "保存エラー",
};

// =============================================================================
// Component
// =============================================================================

type StatusBarProps = {
  wordCount: WordCountData;
  saveStatus?: SaveStatus;
};

export function StatusBar({ wordCount, saveStatus }: StatusBarProps) {
  const { charCount, readingTimeMinutes } = wordCount;
  const statusLabel = saveStatus ? SAVE_STATUS_LABELS[saveStatus] : "";

  if (charCount === 0 && !statusLabel) return null;

  return (
    <div
      role="status"
      aria-live="off"
      className="shrink-0 flex items-center gap-3 px-4 py-1.5 border-t border-border text-xs text-muted-foreground"
    >
      {charCount > 0 && (
        <>
          <span>文字数: {charCount.toLocaleString("ja-JP")}</span>
          <span className="text-border">|</span>
          <span>読了目安: 約{readingTimeMinutes}分</span>
        </>
      )}
      {statusLabel && (
        <>
          {charCount > 0 && <span className="text-border">|</span>}
          <span
            className={
              saveStatus === "error"
                ? "text-destructive"
                : saveStatus === "saved"
                  ? "text-success"
                  : ""
            }
          >
            {statusLabel}
          </span>
        </>
      )}
    </div>
  );
}
