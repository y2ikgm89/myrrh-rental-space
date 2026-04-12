"use client";

/**
 * InlineEditorShell
 *
 * インラインエディタの共通レイアウトシェル
 * - フルスクリーンモード管理
 * - キーボードショートカット（Ctrl+S）
 * - 離脱警告
 * - レイアウト（ヘッダー + エディタ + サイドパネル横並び）
 *
 * デスクトップ（≥1024px）では `panel` は flex 子要素としてインライン配置。
 * モバイル（<1024px）では `panel` 側（SidePanelShell）が fixed オーバーレイに切替。
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
  /** サイドパネル（設定/コメント） */
  panel?: ReactNode;
};

export function InlineEditorShell({
  onSubmit,
  onSave,
  isDirty = false,
  header,
  children,
  panel,
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

      {/* メインエリア（エディタ + パネル） */}
      <div className="flex flex-1 overflow-hidden">
        {/* エディタ領域（伸縮） */}
        <div className="flex-1 min-w-0 h-full overflow-auto">{children}</div>

        {/* サイドパネル
            デスクトップ: SidePanelShell の lg:static により flex 子要素
            モバイル: SidePanelShell の fixed オーバーレイ（flex レイアウト外） */}
        {panel}
      </div>
    </form>
  );
}
