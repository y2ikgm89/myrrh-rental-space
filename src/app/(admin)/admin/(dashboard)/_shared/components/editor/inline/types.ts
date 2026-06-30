/**
 * インラインエディター型定義
 *
 * EditorHeader が消費する props 型のみ保持。
 * SidePanelInjectedProps / FieldMetadata API は `content-types/types.ts` 側にある。
 */

import type { ReactNode } from "react";
import type { PostStatus } from "@/shared/lib/validations/enums/prisma-types";

/**
 * エディターヘッダープロパティ
 */
export type EditorHeaderProps = {
  title: string;
  slug: string;
  isDirty: boolean;
  isPending: boolean;
  onSave: () => void;
  onBack: () => void;
  /** 設定ダイアログを開くコールバック */
  onOpenSettings?: () => void;
  /**
   * 設定ダイアログの短いラベル（例: postSettingsPanel.title）
   * 指定時はツールチップ・aria-label・幅のあるビューでのボタン表記に使う
   */
  metadataPanelLabel?: string;
  /** プレビューコールバック（省略時はプレビューボタン非表示） */
  onPreview?: () => void;
  extraActions?: ReactNode | undefined;
  /** 公開/非公開ボタンの表示（status方式: PostStatus, isPublished方式: boolean） */
  publishActions?:
    | {
        status: PostStatus | boolean;
        onPublish: () => void;
        onUnpublish: () => void;
      }
    | undefined;
  /** コメントボタンの表示 */
  showCommentButton?: boolean;
  /** コメントパネルの開閉状態 */
  isCommentPanelOpen?: boolean;
  /** コメントパネル切り替えコールバック */
  onToggleCommentPanel?: () => void;
  /** コメント数（バッジ表示用） */
  commentCount?: number;
};
