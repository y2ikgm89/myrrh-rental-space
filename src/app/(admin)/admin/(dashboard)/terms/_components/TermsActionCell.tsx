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

type TermsActionCellProps = {
  id: string;
  title: string;
  spacesCount: number;
};

export function TermsActionCell({
  id,
  title,
  spacesCount,
}: TermsActionCellProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeletePending, startDeleteTransition] = useTransition();

  const handleDelete = () => {
    startDeleteTransition(async () => {
      const result = await deleteTerms(id);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <ActionDropdown>
        <ActionDropdownItem href={`/admin/terms/${id}/edit`}>
          編集
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem
          destructive
          disabled={spacesCount > 0}
          onClick={() => setIsDeleteOpen(true)}
        >
          {spacesCount > 0 ? `削除 (${spacesCount}件のスペースあり)` : "削除"}
        </ActionDropdownItem>
      </ActionDropdown>

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        itemName={title}
        onConfirm={handleDelete}
        isPending={isDeletePending}
      />
    </>
  );
}
