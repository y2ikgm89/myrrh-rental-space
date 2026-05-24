"use client";

/**
 * InlineEditorShell
 *
 * インラインエディタの共通レイアウトシェル。
 * - フルスクリーンモード管理
 * - キーボードショートカット（Ctrl+S）
 * - 離脱警告
 * - レイアウト（ヘッダー + エディタ本体）
 *
 * 本文と設定は呼び出し側で独立した RHF フォームとして管理する。
 * このシェルはフォーム要素を持たず、レイアウトと副作用のみを担当する。
 * 保存ボタンは `onSave` を直接呼び、設定ダイアログは親コンポーネントで
 * 別途レンダリングする。
 */

import type { ReactNode } from "react";
import {
  useFullscreenMode,
  useKeyboardShortcuts,
  useBeforeUnload,
} from "./hooks";

type InlineEditorShellProps = {
  /** Ctrl+S で呼ばれる保存ハンドラ */
  onSave?: () => void;
  /** 未保存の変更があるか（離脱警告用） */
  isDirty?: boolean;
  /** ヘッダー部分 */
  header: ReactNode;
  /** メインコンテンツ（LexicalEditor等） */
  children: ReactNode;
};

export function InlineEditorShell({
  onSave,
  isDirty = false,
  header,
  children,
}: InlineEditorShellProps) {
  useFullscreenMode();
  useKeyboardShortcuts(onSave ? { onSave } : {});
  useBeforeUnload({ isDirty });

  return (
    <div className="h-dvh flex flex-col pt-14">
      {header}
      <div className="flex flex-1 min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}
