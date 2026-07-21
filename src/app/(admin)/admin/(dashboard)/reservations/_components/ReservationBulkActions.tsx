"use client";

/**
 * 予約一括操作バー
 *
 * テーブル選択時にフローティング表示
 */

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconCheck, IconLoader2, IconBan } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import {
  bulkConfirmReservations,
  bulkCancelReservations,
} from "@/admin/actions/reservation/bulk";
import { isMutationError } from "@/shared/lib/mutation-result";
import { FloatingBulkActionBar } from "@/admin/components/FloatingBulkActionBar";
import { CancellationReasonDialog } from "./CancellationReasonDialog";

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
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

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

  const handleConfirmBulkCancel = (reason?: string) => {
    startTransition(async () => {
      const result = await bulkCancelReservations(selectedIds, reason);
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
      setCancelDialogOpen(false);
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
          variant="destructive"
          size="sm"
          onClick={() => setCancelDialogOpen(true)}
          disabled={isPending}
        >
          {isPending ? (
            <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <IconBan className="mr-1 h-4 w-4" />
          )}
          一括キャンセル
        </Button>
      </FloatingBulkActionBar>

      <CancellationReasonDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={handleConfirmBulkCancel}
        isPending={isPending}
        targetCount={selectedIds.length}
      />
    </>
  );
}
