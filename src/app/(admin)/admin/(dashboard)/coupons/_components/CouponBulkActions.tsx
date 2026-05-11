"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  IconTicket,
  IconTicketOff,
  IconTrash,
  IconX,
  IconLoader2,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import {
  bulkToggleActiveCoupons,
  bulkDeleteCoupons,
} from "@/admin/actions/coupon/bulk";
import { isMutationError } from "@/shared/lib/mutation-result";

type CouponBulkActionsProps = {
  selectedIds: string[];
  onClear: () => void;
};

export function CouponBulkActions({
  selectedIds,
  onClear,
}: CouponBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (selectedIds.length === 0) return null;

  const handleBulkToggleActive = (isActive: boolean) => {
    startTransition(async () => {
      const result = await bulkToggleActiveCoupons(selectedIds, isActive);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.isActive
          ? `${result.count}件のクーポンを有効化しました`
          : `${result.count}件のクーポンを無効化しました`,
      );
      onClear();
      router.refresh();
    });
  };

  const handleBulkDelete = () => {
    startTransition(async () => {
      const result = await bulkDeleteCoupons(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        setDeleteOpen(false);
        return;
      }

      toast.success(`${result.count}件のクーポンを削除しました`);
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
            onClick={() => handleBulkToggleActive(true)}
            disabled={isPending}
          >
            {isPending ? (
              <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <IconTicket className="mr-1 h-4 w-4" />
            )}
            一括有効化
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkToggleActive(false)}
            disabled={isPending}
          >
            {isPending ? (
              <IconLoader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <IconTicketOff className="mr-1 h-4 w-4" />
            )}
            一括無効化
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
        title={`${selectedIds.length}件のクーポンを削除しますか？`}
        description="この操作は取り消せません。削除後も既存予約のクーポン使用履歴は保持されます。"
        onConfirm={handleBulkDelete}
        isPending={isPending}
      />
    </>
  );
}
