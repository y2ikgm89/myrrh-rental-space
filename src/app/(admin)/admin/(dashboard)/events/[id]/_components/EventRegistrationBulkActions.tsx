"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/admin/components/ui";
import { FloatingBulkActionBar } from "@/admin/components/FloatingBulkActionBar";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import {
  bulkCancelEventRegistrations,
  bulkCheckInEventRegistrations,
} from "@/admin/actions/event-registration";
import { isMutationError } from "@/shared/lib/mutation-result";

interface EventRegistrationBulkActionsProps {
  readonly eventId: string;
  readonly selectedIds: string[];
  readonly onClear: () => void;
}

export function EventRegistrationBulkActions({
  eventId,
  selectedIds,
  onClear,
}: EventRegistrationBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);

  function handleBulkCancel() {
    startTransition(async () => {
      const result = await bulkCancelEventRegistrations(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        setCancelOpen(false);
        return;
      }
      toast.success(
        `${String(result.succeeded)}件キャンセルしました（失敗${String(result.failed)}件）`,
      );
      setCancelOpen(false);
      onClear();
      router.refresh();
    });
  }

  function handleBulkCheckIn() {
    startTransition(async () => {
      const result = await bulkCheckInEventRegistrations(eventId, selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${String(result.succeeded)}件を出席済みにしました（失敗${String(result.failed)}件）`,
      );
      onClear();
      router.refresh();
    });
  }

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
          disabled={isPending}
          onClick={handleBulkCheckIn}
        >
          一括出席済みにする
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={isPending}
          onClick={() => setCancelOpen(true)}
        >
          一括キャンセル
        </Button>
      </FloatingBulkActionBar>

      <DeleteConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`${selectedIds.length}件の申込をキャンセルしますか？`}
        description="Stripe 決済済みの申込は返金され、参加者と管理者に通知メールが送信されます。キャンセル待ちがいる場合は繰り上げ当選が発火します。この操作は取り消せません。"
        confirmLabel="申込をキャンセル"
        onConfirm={handleBulkCancel}
        isPending={isPending}
      />
    </>
  );
}
