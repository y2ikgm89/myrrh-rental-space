"use client";

/**
 * 投稿一括操作バー
 *
 * テーブル選択時にフローティング表示
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  IconEye,
  IconEyeOff,
  IconTrash,
  IconX,
  IconLoader2,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import {
  bulkTogglePostPublished,
  bulkDeletePosts,
} from "@/admin/actions/post/bulk";
import { isMutationError } from "@/shared/lib/mutation-result";

interface PostBulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
}

export function PostBulkActions({
  selectedIds,
  onClear,
}: PostBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (selectedIds.length === 0) return null;

  const handleBulkPublish = (publish: boolean) => {
    startTransition(async () => {
      const result = await bulkTogglePostPublished(selectedIds, publish);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.isPublished
          ? `${result.count}件の投稿を公開しました`
          : `${result.count}件の投稿を非公開にしました`,
      );
      onClear();
      router.refresh();
    });
  };

  const handleBulkDelete = () => {
    startTransition(async () => {
      const result = await bulkDeletePosts(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(`${result.count}件の投稿を削除しました`);
      onClear();
      router.refresh();
    });
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg">
        <span
          className="text-sm font-medium"
          aria-live="polite"
          aria-atomic="true"
        >
          {selectedIds.length}件選択中
        </span>

        <div className="h-4 w-px bg-border" />

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleBulkPublish(true)}
          disabled={isPending}
        >
          {isPending ? (
            <IconLoader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <IconEye className="h-4 w-4 mr-1" />
          )}
          一括公開
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleBulkPublish(false)}
          disabled={isPending}
        >
          {isPending ? (
            <IconLoader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <IconEyeOff className="h-4 w-4 mr-1" />
          )}
          一括非公開
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleBulkDelete}
          disabled={isPending}
          className="text-destructive hover:text-destructive"
        >
          {isPending ? (
            <IconLoader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <IconTrash className="h-4 w-4 mr-1" />
          )}
          一括削除
        </Button>

        <div className="h-4 w-px bg-border" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={isPending}
        >
          <IconX className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
