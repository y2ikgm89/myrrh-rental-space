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
import { hardDeleteTerms, restoreTerms } from "@/admin/actions/terms";
import { isMutationError } from "@/shared/lib/mutation-result";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";

type TermsTrashActionCellProps = {
  id: string;
  title: string;
};

export function TermsTrashActionCell({ id, title }: TermsTrashActionCellProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleRestore = () => {
    startTransition(async () => {
      try {
        const result = await restoreTerms(id);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success(`「${title}」を復元しました（下書きとして戻ります）`);
        router.refresh();
      } catch (error) {
        logger.error("規約復元エラー", { error: getErrorMessage(error) });
        toast.error("復元中にエラーが発生しました");
      }
    });
  };

  const handleHardDelete = () => {
    startTransition(async () => {
      try {
        const result = await hardDeleteTerms(id);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }
        toast.success("規約を完全に削除しました");
        setDeleteOpen(false);
        router.refresh();
      } catch (error) {
        logger.error("規約物理削除エラー", { error: getErrorMessage(error) });
        toast.error("削除中にエラーが発生しました");
      }
    });
  };

  return (
    <>
      <ActionDropdown disabled={isPending}>
        <ActionDropdownItem onClick={handleRestore}>復元</ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem destructive onClick={() => setDeleteOpen(true)}>
          完全削除
        </ActionDropdownItem>
      </ActionDropdown>
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="完全に削除しますか？"
        description={`「${title}」を完全に削除します。この操作は取り消せません（同意記録に紐づきがある場合は失敗します）。`}
        onConfirm={handleHardDelete}
        isPending={isPending}
      />
    </>
  );
}
