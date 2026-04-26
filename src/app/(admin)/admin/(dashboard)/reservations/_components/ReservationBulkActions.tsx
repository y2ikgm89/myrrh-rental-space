"use client";

/**
 * 予約一括操作バー
 *
 * テーブル選択時にフローティング表示
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconCheck, IconX, IconLoader2, IconBan } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import {
  bulkConfirmReservations,
  bulkCancelReservations,
} from "@/admin/actions/reservation/bulk";
import { isMutationError } from "@/shared/lib/mutation-result";

type ReservationBulkActionsProps = {
  selectedIds: string[];
  onClear: () => void;
};

export function ReservationBulkActions({
  selectedIds,
  onClear,
}: ReservationBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (selectedIds.length === 0) return null;

  const handleBulkConfirm = () => {
    startTransition(async () => {
      const result = await bulkConfirmReservations(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      const parts: string[] = [];
      if (result.succeeded > 0) parts.push(`${result.succeeded}件確定`);
      if (result.skipped > 0) parts.push(`${result.skipped}件スキップ`);
      if (result.failed > 0) parts.push(`${result.failed}件失敗`);

      if (result.succeeded > 0) {
        toast.success(parts.join("、"));
      } else {
        toast.info(parts.join("、"));
      }
      onClear();
      router.refresh();
    });
  };

  const handleBulkCancel = () => {
    startTransition(async () => {
      const result = await bulkCancelReservations(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      const parts: string[] = [];
      if (result.succeeded > 0) parts.push(`${result.succeeded}件キャンセル`);
      if (result.skipped > 0) parts.push(`${result.skipped}件スキップ`);
      if (result.failed > 0) parts.push(`${result.failed}件失敗`);

      if (result.succeeded > 0) {
        toast.success(parts.join("、"));
      } else {
        toast.info(parts.join("、"));
      }
      onClear();
      router.refresh();
    });
  };

  return (
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
          onClick={handleBulkConfirm}
          disabled={isPending}
        >
          {isPending ? (
            <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <IconCheck className="mr-1 h-4 w-4" />
          )}
          一括確定
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleBulkCancel}
          disabled={isPending}
          className="text-destructive hover:text-destructive"
        >
          {isPending ? (
            <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <IconBan className="mr-1 h-4 w-4" />
          )}
          一括キャンセル
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
