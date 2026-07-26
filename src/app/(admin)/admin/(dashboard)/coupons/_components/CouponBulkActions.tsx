"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  IconTicket,
  IconTicketOff,
  IconTrash,
  IconLoader2,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { FloatingBulkActionBar } from "@/admin/components/FloatingBulkActionBar";
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

  const handleBulkToggleActive = (isActive: boolean) => {
    startTransition(async () => {
      const result = await bulkToggleActiveCoupons(selectedIds, isActive);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      if (result.count === 0) {
        toast.error("対象のクーポンが見つかりません");
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

      if (result.count === 0) {
        toast.error("対象のクーポンが見つかりません");
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
      <FloatingBulkActionBar
        selectedCount={selectedIds.length}
        onClear={onClear}
        isPending={isPending}
      >
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
      </FloatingBulkActionBar>

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
