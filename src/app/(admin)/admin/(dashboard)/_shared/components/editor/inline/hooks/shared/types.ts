/**
 * 共有エディター型定義
 */

import type { AddCommentPayload } from "../../../lexical/types";

// =============================================================================
// カテゴリ/タグオプション
// =============================================================================

export type CategoryOption = {
  id: string;
  name: string;
  slug?: string;
};

export type TagOption = {
  id: string;
  name: string;
  slug?: string;
};

// =============================================================================
// エディターコア戻り値
// =============================================================================

export type EditorCoreReturn = {
  /** 非同期処理中フラグ */
  isPending: boolean;
  /** 非同期処理を開始するtransition */
  startTransition: (callback: () => void | Promise<void>) => void;
  /** 削除ダイアログ表示フラグ */
  isDeleteDialogOpen: boolean;
  /** 削除ダイアログ表示フラグのセッター */
  setIsDeleteDialogOpen: (value: boolean) => void;
  /** コメントパネル管理 */
  comments: CommentPanelReturn;
  /** 戻るボタンハンドラー（caller が isDirty を渡す） */
  handleBack: (isDirty: boolean) => Promise<void>;
};

// =============================================================================
// コメントパネル管理戻り値
// =============================================================================

export type CommentPanelReturn = {
  isOpen: boolean;
  open: () => void;
  toggle: () => void;
  close: () => void;
  activeMarkId: string | null;
  selectMark: (markId: string | null) => void;
  pendingComment: AddCommentPayload | null;
  handleAddComment: (payload: AddCommentPayload) => void;
  clearPendingComment: () => void;
};
