"use client";

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
  bulkPublishEvents,
  bulkSoftDeleteEvents,
} from "@/admin/actions/event/bulk";
import { isMutationError } from "@/shared/lib/mutation-result";

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

  if (selectedIds.length === 0) return null;

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
          aria-label="選択を解除"
        >
          <IconX className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
