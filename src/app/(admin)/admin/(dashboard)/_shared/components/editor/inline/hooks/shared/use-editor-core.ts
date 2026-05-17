"use client";

/**
 * エディターコアフック
 *
 * 全エディターで共通の state 管理とパネル管理を提供。form 実装には非依存
 * (caller 側で isDirty を集計して `handleBack` に渡す)。
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { useCommentPanel } from "../../hooks";
import type { EditorCoreReturn } from "./types";

export type EditorCoreOptions = {
  /** リスト画面のパス（例: '/admin/posts'） */
  listPath: string;
};

/**
 * エディターコアフック
 *
 * 提供する state:
 * - isPending / startTransition (非同期処理)
 * - isDeleteDialogOpen (削除ダイアログ)
 * - comments (コメントパネル管理)
 * - handleBack(isDirty) (戻るボタンハンドラー、caller が dirty を渡す)
 */
export function useEditorCore({
  listPath,
}: EditorCoreOptions): EditorCoreReturn {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const comments = useCommentPanel();

  const handleBack = async (isDirty: boolean) => {
    if (isDirty) {
      const confirmed = await confirm({
        title: "変更を破棄しますか？",
        description:
          "保存されていない変更があります。破棄してもよろしいですか？",
        confirmLabel: "破棄",
        variant: "destructive",
      });
      if (!confirmed) return;
    }
    router.push(toAppRoute(listPath));
  };

  const wrappedStartTransition = (callback: () => void | Promise<void>) => {
    startTransition(async () => {
      await callback();
    });
  };

  return {
    isPending,
    startTransition: wrappedStartTransition,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    comments,
    handleBack,
  };
}
