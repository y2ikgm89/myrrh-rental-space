/**
 * メディア管理 - 共通フック
 */

"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { deleteMedia } from "@/admin/actions/media";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MediaData } from "@/admin/types/media-picker";

/**
 * URLコピー機能
 */
export function createCopyUrlHandler(): (url: string) => Promise<void> {
  return async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("URLをコピーしました");
  };
}

/**
 * メディア削除機能
 */
export function useDeleteMedia(): {
  handleDelete: (item: MediaData) => void;
  isPending: boolean;
} {
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();

  const handleDelete = async (item: MediaData) => {
    const confirmed = await confirm({
      title: "メディアを削除しますか？",
      // Round-5 audit Finding #7: メディアは記事本文・スペース写真・固定ページ等
      // から URL 文字列として参照されるのみで、DB 上のリレーションを持たない
      // ため参照有無のチェックは行われない。削除すると使用中でも即座にファイル
      // 実体が消え画像が壊れるため、その旨を明示する。
      description: `「${item.filename}」を削除します。この操作は元に戻せません。他のコンテンツで使用中でもチェックされず、参照している箇所は画像が表示されなくなります。`,
      confirmLabel: "削除",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteMedia(item.id);
      if (!isMutationError(result)) {
        toast.success("削除しました");
      } else {
        toast.error(result.error);
      }
    });
  };

  return { handleDelete, isPending };
}
