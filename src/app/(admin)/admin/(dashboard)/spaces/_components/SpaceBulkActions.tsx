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
  bulkTogglePublishedSpaces,
  bulkDeleteSpaces,
} from "@/admin/actions/space/bulk";
import { isMutationError } from "@/shared/lib/mutation-result";

interface SpaceBulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
}

export function SpaceBulkActions({
  selectedIds,
  onClear,
}: SpaceBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleBulkPublish = (publish: boolean) => {
    startTransition(async () => {
      const result = await bulkTogglePublishedSpaces(selectedIds, publish);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.isPublished
          ? `${result.count}件のスペースを公開しました`
          : `${result.count}件のスペースを非公開にしました`,
      );
      onClear();
      router.refresh();
    });
  };

  const handleBulkDelete = () => {
    startTransition(async () => {
      const result = await bulkDeleteSpaces(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        setDeleteOpen(false);
        return;
      }

      toast.success(
        result.skipped > 0
          ? `${result.count}件のスペースを削除しました（${result.skipped}件は予約またはイベント占有のためスキップ）`
          : `${result.count}件のスペースを削除しました`,
      );
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
        title={`${selectedIds.length}件のスペースを削除しますか？`}
        description="この操作は取り消せません。有効な予約または占有中イベントがあるスペースはスキップされます。"
        onConfirm={handleBulkDelete}
        isPending={isPending}
      />
    </>
  );
}
