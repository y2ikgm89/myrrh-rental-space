"use client";

import { useState, useTransition } from "react";
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
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
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

  if (selectedIds.length === 0) return null;

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

      toast.success(`${result.count}件のお知らせを削除しました`);
      setDeleteOpen(false);
      onClear();
      router.refresh();
    });
  };

  return (
    <>
      <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
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
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={isPending}
            className="text-destructive hover:text-destructive"
          >
            <IconTrash className="mr-1 h-4 w-4" />
            一括削除
          </Button>

          <div className="h-4 w-px bg-border" />

          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={isPending}
            aria-label="選択を解除"
          >
            <IconX className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`${selectedIds.length}件のお知らせを削除しますか？`}
        description="この操作は取り消せません。"
        onConfirm={handleBulkDelete}
        isPending={isPending}
      />
    </>
  );
}
