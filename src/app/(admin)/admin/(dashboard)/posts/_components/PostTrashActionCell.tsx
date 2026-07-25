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
import {
  permanentlyDeletePost,
  restorePost,
} from "@/admin/actions/post/mutations";
import { isMutationError } from "@/shared/lib/mutation-result";

type PostTrashActionCellProps = {
  readonly id: string;
  readonly displayName: string;
};

export function PostTrashActionCell({
  id,
  displayName,
}: PostTrashActionCellProps) {
  const router = useRouter();
  const [permanentOpen, setPermanentOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleRestore = () => {
    startTransition(async () => {
      const result = await restorePost(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("投稿を復元しました");
      router.refresh();
    });
  };

  const handlePermanentDelete = () => {
    startTransition(async () => {
      const result = await permanentlyDeletePost(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("投稿を完全に削除しました");
      setPermanentOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <ActionDropdown disabled={isPending}>
        <ActionDropdownItem onClick={handleRestore}>復元</ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem destructive onClick={() => setPermanentOpen(true)}>
          完全に削除
        </ActionDropdownItem>
      </ActionDropdown>
      <DeleteConfirmDialog
        open={permanentOpen}
        onOpenChange={setPermanentOpen}
        title={`「${displayName}」を完全に削除しますか？`}
        description="完全に削除された投稿は復元できません。本当に削除してもよろしいですか？"
        onConfirm={handlePermanentDelete}
        isPending={isPending}
      />
    </>
  );
}
