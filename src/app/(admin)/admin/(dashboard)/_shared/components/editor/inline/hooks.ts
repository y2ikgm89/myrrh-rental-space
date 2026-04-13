/**
 * インラインエディター用フック
 *
 * 公式Lexical/Gutenbergパターンに準拠
 * - レイアウトラッパーなし
 * - 各機能をフックとして提供
 */

"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useAdminLayout } from "@/admin/contexts/admin-layout-context";
import type { AddCommentPayload } from "../lexical/types";

// =============================================================================
// useFullscreenMode - フルスクリーンモード管理
// =============================================================================

/**
 * エディタのフルスクリーンモードを管理
 *
 * マウント時に左サイドバーとヘッダーを非表示にし、
 * アンマウント時に復元する
 */
export function useFullscreenMode() {
  const { enterFullscreen, exitFullscreen, isFullscreen } = useAdminLayout();

  useLayoutEffect(() => {
    enterFullscreen();
    return () => exitFullscreen();
  }, [enterFullscreen, exitFullscreen]);

  return { isFullscreen };
}

// =============================================================================
// useKeyboardShortcuts - キーボードショートカット
// =============================================================================

type UseKeyboardShortcutsProps = {
  onSave?: () => void;
};

/**
 * エディタのキーボードショートカットを管理
 *
 * - Ctrl/Cmd + S: 保存
 */
export function useKeyboardShortcuts({ onSave }: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        onSave?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onSave]);
}

// =============================================================================
// useBeforeUnload - 離脱警告
// =============================================================================

type UseBeforeUnloadProps = {
  isDirty: boolean;
};

/**
 * 未保存の変更がある場合にブラウザ離脱警告を表示
 */
export function useBeforeUnload({ isDirty }: UseBeforeUnloadProps) {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
}

// =============================================================================
// useCommentPanel - コメントパネル管理
// =============================================================================

/**
 * エディターのコメントパネル管理フック
 *
 * 本文中のマークと連動するコメントパネル（インラインの inspector）の開閉と
 * 保留中コメントを管理する。
 *
 * 記事設定は本文編集と独立したダイアログで管理するため、このフックには含まない。
 */
export function useCommentPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeMarkId, setActiveMarkId] = useState<string | null>(null);
  const [pendingComment, setPendingComment] =
    useState<AddCommentPayload | null>(null);

  const open = () => setIsOpen(true);
  const toggle = () => setIsOpen((prev) => !prev);

  const close = () => {
    setIsOpen(false);
    setPendingComment(null);
  };

  // マーク選択（コメントパネルを自動的に開く）
  const selectMark = (markId: string | null) => {
    setActiveMarkId(markId);
    if (markId) setIsOpen(true);
  };

  // コメント追加ハンドラ（LexicalEditor から呼ばれる）
  const handleAddComment = (payload: AddCommentPayload) => {
    setPendingComment(payload);
    setIsOpen(true);
  };

  const clearPendingComment = () => {
    setPendingComment(null);
  };

  return {
    isOpen,
    open,
    toggle,
    close,
    activeMarkId,
    selectMark,
    pendingComment,
    handleAddComment,
    clearPendingComment,
  };
}
