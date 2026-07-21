"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconTrash, IconLoader2, IconChevronDown } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { FloatingBulkActionBar } from "@/admin/components/FloatingBulkActionBar";
import {
  bulkDeleteInquiries,
  bulkSetStatusInquiries,
} from "@/admin/actions/inquiry/bulk";
import { isMutationError } from "@/shared/lib/mutation-result";
import { keysOf } from "@/shared/lib/serialize";
import { INQUIRY_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import type { InquiryStatus } from "@/shared/lib/validations/enums/prisma-types";

interface InquiryBulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
}

export function InquiryBulkActions({
  selectedIds,
  onClear,
}: InquiryBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleBulkSetStatus = (newStatus: InquiryStatus) => {
    startTransition(async () => {
      const result = await bulkSetStatusInquiries(selectedIds, newStatus);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      const label = INQUIRY_STATUS_LABELS[newStatus];
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
      const result = await bulkDeleteInquiries(selectedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        setDeleteOpen(false);
        return;
      }

      toast.success(`${result.count}件のお問い合わせを削除しました`);
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              ステータス変更
              <IconChevronDown className="ml-1 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {keysOf(INQUIRY_STATUS_LABELS).map((status) => (
              <DropdownMenuItem
                key={status}
                onClick={() => handleBulkSetStatus(status)}
              >
                {INQUIRY_STATUS_LABELS[status]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDeleteOpen(true)}
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
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`${selectedIds.length}件のお問い合わせを削除しますか？`}
        description="この操作は取り消せません。"
        onConfirm={handleBulkDelete}
        isPending={isPending}
      />
    </>
  );
}
