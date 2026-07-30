/**
 * メディア管理 - 共通フック
 */

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();

  const handleDelete = (item: MediaData) => {
    void (async () => {
      const confirmed = await confirm({
        title: "メディアを削除しますか？",
        description: `「${item.filename}」を削除します。この操作は元に戻せません。他のコンテンツで使用中の場合、参照チェックにより削除がブロックされます。`,
        confirmLabel: "削除",
        variant: "destructive",
      });
      if (!confirmed) return;

      startTransition(async () => {
        const result = await deleteMedia(item.id);
        if (!isMutationError(result)) {
          toast.success("削除しました");
          router.refresh();
        } else {
          toast.error(result.error);
        }
      });
    })();
  };

  return { handleDelete, isPending };
}
