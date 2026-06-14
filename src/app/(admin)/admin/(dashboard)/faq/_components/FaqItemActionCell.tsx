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
import { deleteFaqItem } from "@/admin/actions/faq";
import { isMutationError } from "@/shared/lib/mutation-result";
import { FaqItemMoveDialog } from "./FaqItemMoveDialog";

type FaqItemActionCellProps = {
  readonly id: string;
  readonly question: string;
  readonly categoryId: string;
  readonly categories: readonly { id: string; name: string }[];
  readonly onEdit: () => void;
};

export function FaqItemActionCell({
  id,
  question,
  categoryId,
  categories,
  onEdit,
}: FaqItemActionCellProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // 公開状態の切替は同じ行の PublishSwitch（公開状態列）に一本化（責務単一化）。
  // ActionDropdown には publish トグルを置かない。

  const canMove = categories.length > 1;

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
        <ActionDropdownItem
          disabled={!canMove}
          onClick={() => setMoveOpen(true)}
        >
          別カテゴリへ移動
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem destructive onClick={() => setDeleteOpen(true)}>
          削除
        </ActionDropdownItem>
      </ActionDropdown>
      <FaqItemMoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        itemId={id}
        question={question}
        currentCategoryId={categoryId}
        categories={categories}
      />
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
