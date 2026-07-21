"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/admin/components/ui";
import { FloatingBulkActionBar } from "@/admin/components/FloatingBulkActionBar";
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

  function handleBulkCancel() {
    startTransition(async () => {
      const result = await bulkCancelEventRegistrations(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${String(result.succeeded)}件キャンセルしました（失敗${String(result.failed)}件）`,
      );
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
        onClick={handleBulkCancel}
      >
        一括キャンセル
      </Button>
    </FloatingBulkActionBar>
  );
}
