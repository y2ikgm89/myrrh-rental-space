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
import { deleteFaqItem, updateFaqItemPublished } from "@/admin/actions/faq";
import { isMutationError } from "@/shared/lib/mutation-result";

type FaqItemActionCellProps = {
  readonly id: string;
  readonly question: string;
  readonly isPublished: boolean;
  readonly onEdit: () => void;
};

export function FaqItemActionCell({
  id,
  question,
  isPublished,
  onEdit,
}: FaqItemActionCellProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleTogglePublished = () => {
    startTransition(async () => {
      const result = await updateFaqItemPublished(id, !isPublished);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.isPublished
          ? "FAQ項目を公開しました"
          : "FAQ項目を非公開にしました",
      );
      router.refresh();
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteFaqItem(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("FAQ項目を削除しました");
      setDeleteOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <ActionDropdown disabled={isPending}>
        <ActionDropdownItem onClick={onEdit}>編集</ActionDropdownItem>
        <ActionDropdownItem onClick={handleTogglePublished}>
          {isPublished ? "非公開にする" : "公開する"}
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem destructive onClick={() => setDeleteOpen(true)}>
          削除
        </ActionDropdownItem>
      </ActionDropdown>
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName={question}
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </>
  );
}
