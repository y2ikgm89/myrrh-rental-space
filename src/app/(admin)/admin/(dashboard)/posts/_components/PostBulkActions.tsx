"use client";

/**
 * 投稿一括操作バー
 *
 * テーブル選択時にフローティング表示
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  IconEye,
  IconEyeOff,
  IconTrash,
  IconLoader2,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { FloatingBulkActionBar } from "@/admin/components/FloatingBulkActionBar";
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
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  // Round-4 audit Finding #5 / high: 従来は一括削除ボタンの onClick で即 bulkDelete
  // を発火していたため、隣接する 一括非公開 ボタン (variant=outline / size=sm、
  // ~120px 隣) との誤タップで全 30 件が physically 削除される事故が起きうる。
  // NewsBulkActions と同型に DeleteConfirmDialog を挟み、件数を dialog title に
  // 明示して stale-selection 誤操作も検知しやすくする。
  const handleBulkDelete = () => {
    startTransition(async () => {
      const result = await bulkDeletePosts(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        setDeleteOpen(false);
        return;
      }

      toast.success(`${result.count}件の投稿を削除しました`);
      setDeleteOpen(false);
      onClear();
      router.refresh();
    });
  };

  return (
    <>
      <FloatingBulkActionBar
        selectedCount={selectedIds.length}
        onClear={onClear}
        isPending={isPending}
      >
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
          variant="destructive"
          size="sm"
          onClick={() => setDeleteOpen(true)}
          disabled={isPending}
        >
          <IconTrash className="h-4 w-4 mr-1" />
          一括削除
        </Button>
      </FloatingBulkActionBar>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`${selectedIds.length}件の投稿を削除しますか？`}
        description="この操作は取り消せません。"
        onConfirm={handleBulkDelete}
        isPending={isPending}
      />
    </>
  );
}
