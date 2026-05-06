"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  IconUserCheck,
  IconUserOff,
  IconTrash,
  IconX,
  IconLoader2,
  IconChevronDown,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import {
  bulkToggleActiveCustomers,
  bulkDeleteCustomers,
  bulkSetStatusCustomers,
} from "@/admin/actions/customer/bulk";
import { isMutationError } from "@/shared/lib/mutation-result";
import { CUSTOMER_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";

interface CustomerBulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
}

export function CustomerBulkActions({
  selectedIds,
  onClear,
}: CustomerBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (selectedIds.length === 0) return null;

  const handleBulkToggleActive = (isActive: boolean) => {
    startTransition(async () => {
      const result = await bulkToggleActiveCustomers(selectedIds, isActive);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.isActive
          ? `${result.count}件の顧客を有効化しました`
          : `${result.count}件の顧客を無効化しました`,
      );
      onClear();
      router.refresh();
    });
  };

  const handleBulkSetStatus = (newStatus: CustomerStatus) => {
    startTransition(async () => {
      const result = await bulkSetStatusCustomers(selectedIds, newStatus);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      const label = CUSTOMER_STATUS_LABELS[newStatus];
      const baseMessage = `${result.count}件のステータスを「${label}」に変更しました`;
      const message =
        result.rejectedIds.length > 0
          ? `${baseMessage}（${result.rejectedIds.length}件は遷移不可のためスキップ）`
          : baseMessage;
      toast.success(message);
      onClear();
      router.refresh();
    });
  };

  const handleBulkDelete = () => {
    startTransition(async () => {
      const result = await bulkDeleteCustomers(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        setDeleteOpen(false);
        return;
      }

      toast.success(`${result.count}件の顧客を削除しました`);
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
              <IconUserCheck className="mr-1 h-4 w-4" />
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
              <IconUserOff className="mr-1 h-4 w-4" />
            )}
            一括無効化
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isPending}>
                ステータス変更
                <IconChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(CUSTOMER_STATUS_LABELS) as CustomerStatus[]).map(
                (status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => handleBulkSetStatus(status)}
                  >
                    {CUSTOMER_STATUS_LABELS[status]}
                  </DropdownMenuItem>
                ),
              )}
            </DropdownMenuContent>
          </DropdownMenu>

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
        title={`${selectedIds.length}件の顧客を削除しますか？`}
        description="この操作は取り消せません。関連する予約・お問い合わせ等は紐づきが解除されます。"
        onConfirm={handleBulkDelete}
        isPending={isPending}
      />
    </>
  );
}
