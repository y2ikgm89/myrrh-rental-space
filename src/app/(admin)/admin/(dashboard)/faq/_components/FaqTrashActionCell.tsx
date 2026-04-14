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
  permanentlyDeleteFaqCategory,
  permanentlyDeleteFaqItem,
  restoreFaqCategory,
  restoreFaqItem,
} from "@/admin/actions/faq";
import { isMutationError } from "@/shared/lib/mutation-result";

type Kind = "category" | "item";

type FaqTrashActionCellProps = {
  readonly kind: Kind;
  readonly id: string;
  readonly displayName: string;
};

export function FaqTrashActionCell({
  kind,
  id,
  displayName,
}: FaqTrashActionCellProps) {
  const router = useRouter();
  const [permanentOpen, setPermanentOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleRestore = () => {
    startTransition(async () => {
      const result =
        kind === "category"
          ? await restoreFaqCategory(id)
          : await restoreFaqItem(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        kind === "category" ? "カテゴリを復元しました" : "質問を復元しました",
      );
      router.refresh();
    });
  };

  const handlePermanentDelete = () => {
    startTransition(async () => {
      const result =
        kind === "category"
          ? await permanentlyDeleteFaqCategory(id)
          : await permanentlyDeleteFaqItem(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        kind === "category"
          ? "カテゴリを完全に削除しました"
          : "質問を完全に削除しました",
      );
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
        title={
          kind === "category"
            ? `「${displayName}」を完全に削除しますか？`
            : "この質問を完全に削除しますか？"
        }
        description={
          kind === "category"
            ? "カテゴリを完全に削除すると、配下の質問もすべて削除されます。この操作は取り消せません。"
            : "完全に削除された質問は復元できません。本当に削除してもよろしいですか？"
        }
        onConfirm={handlePermanentDelete}
        isPending={isPending}
      />
    </>
  );
}
