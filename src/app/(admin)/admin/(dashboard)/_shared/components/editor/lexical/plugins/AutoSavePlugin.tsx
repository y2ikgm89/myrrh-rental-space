/**
 * Auto Save Plugin
 *
 * @description デバウンス付きオートセーブプラグイン
 *
 * 2層保存:
 * - LocalStorage: 2秒debounce（即時下書き保存）
 * - Server Action: 10秒debounce（親コンポーネント経由）
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

// =============================================================================
// Types
// =============================================================================

export type SaveStatus = "idle" | "saving" | "saved" | "unsaved" | "error";

// =============================================================================
// Hook
// =============================================================================

export function useAutoSaveStatus() {
  const [status, setStatus] = useState<SaveStatus>("idle");
  return { saveStatus: status, setSaveStatus: setStatus };
}

// =============================================================================
// Plugin
// =============================================================================

const LOCAL_DEBOUNCE_MS = 2000;
const SERVER_DEBOUNCE_MS = 10000;

function getDraftSavedAt(): string {
  return String(
    Math.trunc(window.performance.timeOrigin + window.performance.now()),
  );
}

export function AutoSavePlugin({
  onAutoSave,
  autoSaveKey,
  onStatusChange,
}: {
  onAutoSave?: (json: string) => Promise<void>;
  autoSaveKey?: string;
  onStatusChange?: (status: SaveStatus) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const localTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstUpdateRef = useRef(true);

  useEffect(() => {
    if (!autoSaveKey && !onAutoSave) return;

    return editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves }) => {
        // 初回更新は無視（初期化時）
        if (isFirstUpdateRef.current) {
          isFirstUpdateRef.current = false;
          return;
        }

        // 変更がない場合は無視
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;

        onStatusChange?.("unsaved");

        const json = JSON.stringify(editorState.toJSON());

        // LocalStorage保存（2秒debounce）
        if (autoSaveKey) {
          if (localTimerRef.current) clearTimeout(localTimerRef.current);
          localTimerRef.current = setTimeout(() => {
            try {
              localStorage.setItem(`lexical-draft:${autoSaveKey}`, json);
              localStorage.setItem(
                `lexical-draft-time:${autoSaveKey}`,
                getDraftSavedAt(),
              );
            } catch {
              // QuotaExceeded等は無視
            }
          }, LOCAL_DEBOUNCE_MS);
        }

        // Server保存（10秒debounce）
        if (onAutoSave) {
          if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
          serverTimerRef.current = setTimeout(() => {
            onStatusChange?.("saving");
            onAutoSave(json)
              .then(() => onStatusChange?.("saved"))
              .catch(() => onStatusChange?.("error"));
          }, SERVER_DEBOUNCE_MS);
        }
      },
    );
  }, [editor, onAutoSave, autoSaveKey, onStatusChange]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
      if (serverTimerRef.current) clearTimeout(serverTimerRef.current);
    };
  }, []);

  return null;
}

// =============================================================================
// Draft Recovery
// =============================================================================

export function getDraftJson(
  autoSaveKey: string,
): { json: string; savedAt: string } | null {
  try {
    const json = localStorage.getItem(`lexical-draft:${autoSaveKey}`);
    const savedAt = localStorage.getItem(`lexical-draft-time:${autoSaveKey}`);
    if (json && savedAt) {
      return { json, savedAt };
    }
  } catch {
    // localStorage不可
  }
  return null;
}

/**
 * `clearDraft(autoSaveKey)` が呼ばれたことを通知する CustomEvent 名
 * （`detail` に対象の `autoSaveKey` を積む）。
 *
 * `useDraftRecovery`（use-draft-recovery.ts）はマウント時に 1 回だけ
 * LocalStorage を読み、以降のタイピングによる debounce 再保存（このファイルの
 * 通常の自動保存）はそのスナップショットに反映しない設計（起動時に見つかった
 * 下書きを一度だけ提示する UI のため）。しかし `clearDraft` による削除だけは
 * 例外的に同一マウント中でも即座に反映したい（保存直後に、既に存在しない
 * 下書きをバナーが提示し続けるのを防ぐ）ため、この CustomEvent 経由で
 * 明示的に通知する。
 */
export const DRAFT_CLEARED_EVENT = "lexical-draft-cleared";

export function clearDraft(autoSaveKey: string): void {
  try {
    localStorage.removeItem(`lexical-draft:${autoSaveKey}`);
    localStorage.removeItem(`lexical-draft-time:${autoSaveKey}`);
  } catch {
    // localStorage不可
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<string>(DRAFT_CLEARED_EVENT, { detail: autoSaveKey }),
    );
  }
}
