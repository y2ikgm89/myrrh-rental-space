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
import { deleteFaqCategory } from "@/admin/actions/faq";
import { isMutationError } from "@/shared/lib/mutation-result";

type FaqCategoryActionCellProps = {
  readonly id: string;
  readonly name: string;
  readonly itemCount: number;
};

export function FaqCategoryActionCell({
  id,
  name,
  itemCount,
}: FaqCategoryActionCellProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canDelete = itemCount === 0;

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteFaqCategory(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("カテゴリを削除しました");
      setDeleteOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <ActionDropdown disabled={isPending}>
        <ActionDropdownItem href={`/admin/faq/categories/${id}/edit`}>
          編集
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem
          destructive
          disabled={!canDelete}
          onClick={() => setDeleteOpen(true)}
        >
          削除
        </ActionDropdownItem>
      </ActionDropdown>
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName={name}
        description={
          canDelete
            ? `「${name}」を削除します。この操作は取り消せません。`
            : `「${name}」には質問が ${itemCount} 件紐づいているため削除できません。先に質問を削除または別カテゴリへ移動してください。`
        }
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </>
  );
}
