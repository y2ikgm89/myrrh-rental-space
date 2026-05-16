"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SubmitButton,
} from "@/admin/components/ui";
import {
  updateSpaceCategory,
  deleteSpaceCategory,
} from "@/admin/actions/space-category";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { SpaceCategoryWithStats } from "@/shared/lib/validations/space-category";
import { CategoryForm } from "./CategoryForm";

type CategoryActionCellProps = {
  category: SpaceCategoryWithStats;
};

export function CategoryActionCell({ category }: CategoryActionCellProps) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeletePending, startDeleteTransition] = useTransition();

  const boundUpdate = updateSpaceCategory.bind(null, category.id);
  const [lastResult, formAction, isEditPending] = useActionState(
    boundUpdate,
    undefined,
  );

  const formId = `space-category-edit-form-${category.id}`;
  const hasSpaces = category._count.spaces > 0;

  // success を render 中 derive + close を render 中 sync で表現
  // (set-state-in-effect 違反回避、公式「Adjusting State During Render」パターン)
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setIsEditOpen(false);
    }
  }

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const handleDelete = () => {
    startDeleteTransition(async () => {
      const result = await deleteSpaceCategory(category.id);
      if (!isMutationError(result)) {
        toast.success("削除しました");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <ActionDropdown>
        <ActionDropdownItem onClick={() => setIsEditOpen(true)}>
          編集
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem
          destructive
          disabled={hasSpaces}
          onClick={() => setIsDeleteOpen(true)}
        >
          {hasSpaces
            ? `削除 (${category._count.spaces}件のスペースあり)`
            : "削除"}
        </ActionDropdownItem>
      </ActionDropdown>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>カテゴリー編集</DialogTitle>
          </DialogHeader>
          <CategoryForm
            category={category}
            isPending={isEditPending}
            lastResult={lastResult}
            formAction={formAction}
            formId={formId}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditOpen(false)}
              disabled={isEditPending}
            >
              キャンセル
            </Button>
            <SubmitButton
              form={formId}
              isPending={isEditPending}
              label="更新"
              pendingLabel="更新中..."
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        itemName={category.name}
        onConfirm={handleDelete}
        isPending={isDeletePending}
      />
    </>
  );
}
