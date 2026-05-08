"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
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

  if (selectedIds.length === 0) return null;

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
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
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
