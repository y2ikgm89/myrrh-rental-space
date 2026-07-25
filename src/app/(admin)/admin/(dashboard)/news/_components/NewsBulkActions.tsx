"use client";

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
  bulkTogglePublishedNews,
  bulkDeleteNews,
} from "@/admin/actions/news/bulk";
import { isMutationError } from "@/shared/lib/mutation-result";

interface NewsBulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
}

export function NewsBulkActions({
  selectedIds,
  onClear,
}: NewsBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleBulkPublish = (publish: boolean) => {
    startTransition(async () => {
      const result = await bulkTogglePublishedNews(selectedIds, publish);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.isPublished
          ? `${result.count}件のお知らせを公開しました`
          : `${result.count}件のお知らせを非公開にしました`,
      );
      onClear();
      router.refresh();
    });
  };

  const handleBulkDelete = () => {
    startTransition(async () => {
      const result = await bulkDeleteNews(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        setDeleteOpen(false);
        return;
      }

      toast.success(`${result.count}件のお知らせをゴミ箱へ移動しました`);
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
            <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <IconEye className="mr-1 h-4 w-4" />
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
            <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <IconEyeOff className="mr-1 h-4 w-4" />
          )}
          一括非公開
        </Button>

        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDeleteOpen(true)}
          disabled={isPending}
        >
          <IconTrash className="mr-1 h-4 w-4" />
          一括削除
        </Button>
      </FloatingBulkActionBar>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`${selectedIds.length}件のお知らせを削除しますか？`}
        description="削除されたお知らせはゴミ箱に 30 日間保持され、復元できます。"
        onConfirm={handleBulkDelete}
        isPending={isPending}
      />
    </>
  );
}
