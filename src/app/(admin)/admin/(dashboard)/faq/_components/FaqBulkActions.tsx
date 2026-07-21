"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  IconChecks,
  IconEyeOff,
  IconFolder,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { FloatingBulkActionBar } from "@/admin/components/FloatingBulkActionBar";
import { bulkDeleteFaqItems, bulkPublishFaqItems } from "@/admin/actions/faq";
import { isMutationError } from "@/shared/lib/mutation-result";
import { FaqBulkMoveDialog } from "./FaqBulkMoveDialog";

type FaqBulkActionsProps = {
  readonly selectedIds: readonly string[];
  readonly categories: readonly { id: string; name: string }[];
  readonly onClear: () => void;
};

export function FaqBulkActions({
  selectedIds,
  categories,
  onClear,
}: FaqBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  const handleBulkPublish = (isPublished: boolean) => {
    startTransition(async () => {
      const result = await bulkPublishFaqItems([...selectedIds], isPublished);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${result.count} 件を${isPublished ? "公開" : "非公開"}にしました`,
      );
      onClear();
      router.refresh();
    });
  };

  const handleBulkDelete = () => {
    startTransition(async () => {
      const result = await bulkDeleteFaqItems([...selectedIds]);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.count} 件をゴミ箱へ移動しました`);
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleBulkPublish(true)}
          disabled={isPending}
        >
          <IconChecks className="mr-1 h-4 w-4" aria-hidden="true" />
          公開
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleBulkPublish(false)}
          disabled={isPending}
        >
          <IconEyeOff className="mr-1 h-4 w-4" aria-hidden="true" />
          非公開
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMoveOpen(true)}
          disabled={isPending}
        >
          <IconFolder className="mr-1 h-4 w-4" aria-hidden="true" />
          移動
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setDeleteOpen(true)}
          disabled={isPending}
        >
          <IconTrash className="mr-1 h-4 w-4" aria-hidden="true" />
          削除
        </Button>
      </FloatingBulkActionBar>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`${selectedIds.length} 件の質問を削除しますか？`}
        description="削除された質問はゴミ箱に 30 日間保持され、復元できます。"
        onConfirm={handleBulkDelete}
        isPending={isPending}
      />

      <FaqBulkMoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        selectedIds={selectedIds}
        categories={categories}
        onSuccess={() => {
          setMoveOpen(false);
          onClear();
          router.refresh();
        }}
      />
    </>
  );
}
