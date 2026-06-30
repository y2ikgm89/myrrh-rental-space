"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { deleteTerms } from "@/admin/actions/terms";
import { isMutationError } from "@/shared/lib/mutation-result";
import { logger } from "@/shared/lib/errors/logger-core";
import { getErrorMessage } from "@/shared/lib/errors";

type TermsActionCellProps = {
  id: string;
  title: string;
};

export function TermsActionCell({ id, title }: TermsActionCellProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const result = await deleteTerms(id);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success("規約を削除しました");
        setDeleteOpen(false);
        router.refresh();
      } catch (error) {
        logger.error("規約削除エラー", { error: getErrorMessage(error) });
        toast.error("削除中にエラーが発生しました");
      }
    });
  };

  return (
    <>
      <ActionDropdown disabled={isPending}>
        <ActionDropdownItem href={`/admin/terms/${id}/edit`}>
          編集
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem destructive onClick={() => setDeleteOpen(true)}>
          削除
        </ActionDropdownItem>
      </ActionDropdown>
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName={title}
        description={`「${title}」を削除します。同意記録は保持されます。`}
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </>
  );
}
