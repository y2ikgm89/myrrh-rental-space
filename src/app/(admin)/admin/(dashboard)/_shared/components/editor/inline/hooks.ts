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
// useEditorPanels - 排他的パネル管理（設定/コメント）
// =============================================================================

type PanelType = "settings" | "comments" | null;

/**
 * エディターの排他的パネル管理フック
 *
 * 設定パネルとコメントパネルを排他的に管理
 * （同時に1つのパネルのみ表示）
 */
export function useEditorPanels() {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [activeMarkId, setActiveMarkId] = useState<string | null>(null);
  const [pendingComment, setPendingComment] =
    useState<AddCommentPayload | null>(null);

  // 設定パネル
  const openSettings = () => setActivePanel("settings");
  const toggleSettings = () => {
    setActivePanel((prev) => (prev === "settings" ? null : "settings"));
  };

  // コメントパネル
  const openComments = () => setActivePanel("comments");
  const toggleComments = () => {
    setActivePanel((prev) => (prev === "comments" ? null : "comments"));
  };

  // パネル閉じる（pendingCommentもクリア）
  const closePanel = () => {
    setActivePanel(null);
    setPendingComment(null);
  };

  // マーク選択（コメントパネルを自動的に開く）
  const selectMark = (markId: string | null) => {
    setActiveMarkId(markId);
    if (markId) setActivePanel("comments");
  };

  // コメント追加ハンドラ（LexicalEditorから呼ばれる）
  const handleAddComment = (payload: AddCommentPayload) => {
    setPendingComment(payload);
    setActivePanel("comments");
  };

  // pendingCommentをクリア
  const clearPendingComment = () => {
    setPendingComment(null);
  };

  return {
    activePanel,
    isSettingsPanelOpen: activePanel === "settings",
    isCommentsPanelOpen: activePanel === "comments",
    openSettings,
    toggleSettings,
    openComments,
    toggleComments,
    closePanel,
    activeMarkId,
    selectMark,
    pendingComment,
    handleAddComment,
    clearPendingComment,
  };
}
