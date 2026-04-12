"use client";

/**
 * InlineEditorShell
 *
 * インラインエディタの共通レイアウトシェル
 * - フルスクリーンモード管理
 * - キーボードショートカット（Ctrl+S）
 * - 離脱警告
 * - レイアウト（ヘッダー + エディタ本体）
 *
 * 記事設定等のサイドパネルは LexicalEditor の `trailingPanel` prop に渡す
 * （InspectorSidebar と同じ flex 行に配置され、ツールバーの下から始まる）。
 */

import type { FormEvent, ReactNode } from "react";
import {
  useFullscreenMode,
  useKeyboardShortcuts,
  useBeforeUnload,
} from "./hooks";

type InlineEditorShellProps = {
  /** フォーム送信ハンドラ */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /** Ctrl+S で呼ばれる保存ハンドラ */
  onSave?: () => void;
  /** 未保存の変更があるか */
  isDirty?: boolean;
  /** ヘッダー部分 */
  header: ReactNode;
  /** メインコンテンツ（LexicalEditor等） */
  children: ReactNode;
};

export function InlineEditorShell({
  onSubmit,
  onSave,
  isDirty = false,
  header,
  children,
}: InlineEditorShellProps) {
  // フルスクリーンモード（サイドバー・ヘッダー非表示）
  useFullscreenMode();

  // キーボードショートカット
  useKeyboardShortcuts(onSave ? { onSave } : {});

  // 離脱警告
  useBeforeUnload({ isDirty });

  return (
    <form onSubmit={onSubmit} className="h-screen flex flex-col pt-14">
      {/* ヘッダー（固定） */}
      {header}

      {/* メインエリア（エディタ本体） */}
      <div className="flex flex-1 min-w-0 overflow-hidden">{children}</div>
    </form>
  );
}
