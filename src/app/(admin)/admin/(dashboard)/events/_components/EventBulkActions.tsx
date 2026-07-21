"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  IconEye,
  IconEyeOff,
  IconTrash,
  IconLoader2,
  IconBan,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { FloatingBulkActionBar } from "@/admin/components/FloatingBulkActionBar";
import {
  bulkPublishEvents,
  bulkSoftDeleteEvents,
  bulkSetStatusEvents,
} from "@/admin/actions/event/bulk";
import { isMutationError } from "@/shared/lib/mutation-result";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";

interface EventBulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
}

export function EventBulkActions({
  selectedIds,
  onClear,
}: EventBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);

  const handleBulkPublish = (publish: boolean) => {
    startTransition(async () => {
      const result = await bulkPublishEvents(selectedIds, publish);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      const action = result.isPublished ? "公開" : "非公開";
      const baseMessage = `${result.count}件のイベントを${action}にしました`;
      const message =
        result.skipped > 0
          ? `${baseMessage}（${result.skipped}件は状態遷移不可でスキップ）`
          : baseMessage;
      toast.success(message);
      onClear();
      router.refresh();
    });
  };

  const handleBulkCancel = () => {
    startTransition(async () => {
      const result = await bulkSetStatusEvents(
        selectedIds,
        EventStatus.CANCELLED,
      );
      if (isMutationError(result)) {
        toast.error(result.error);
        setCancelOpen(false);
        return;
      }

      const baseMessage = `${result.count}件のイベントをキャンセルしました`;
      const message =
        result.rejectedIds.length > 0
          ? `${baseMessage}（${result.rejectedIds.length}件は遷移不可のためスキップ）`
          : baseMessage;
      toast.success(message);
      setCancelOpen(false);
      onClear();
      router.refresh();
    });
  };

  const handleBulkDelete = () => {
    startTransition(async () => {
      const result = await bulkSoftDeleteEvents(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(`${result.count}件のイベントを削除しました`);
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
          variant="outline"
          size="sm"
          onClick={() => setCancelOpen(true)}
          disabled={isPending}
          className="text-warning hover:text-warning"
        >
          <IconBan className="h-4 w-4 mr-1" />
          一括キャンセル
        </Button>

        <Button
          variant="destructive"
          size="sm"
          onClick={handleBulkDelete}
          disabled={isPending}
        >
          {isPending ? (
            <IconLoader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <IconTrash className="h-4 w-4 mr-1" />
          )}
          一括削除
        </Button>
      </FloatingBulkActionBar>

      <DeleteConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`${selectedIds.length}件のイベントをキャンセルしますか？`}
        description="キャンセルすると参加者に通知メールが送信されます。この操作は取り消せません。"
        onConfirm={handleBulkCancel}
        isPending={isPending}
      />
    </>
  );
}
