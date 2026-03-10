"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  SubmitButton,
} from "@/admin/components/ui";
import { updateSpaceCategory } from "@/admin/actions/space-category";
import { isMutationError } from "@/shared/lib/mutation-result";
import type {
  SpaceCategoryFormInput,
  SpaceCategoryWithStats,
} from "@/admin/lib/validations/space-category";
import { CategoryForm } from "./CategoryForm";

type EditCategoryDialogProps = {
  category: SpaceCategoryWithStats;
};

export function EditCategoryDialog({ category }: EditCategoryDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = (data: SpaceCategoryFormInput) => {
    startTransition(async () => {
      const result = await updateSpaceCategory(category.id, data);
      if (!isMutationError(result)) {
        toast.success("更新しました");
        setIsOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          編集
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>カテゴリー編集</DialogTitle>
        </DialogHeader>
        <CategoryForm
          category={category}
          isPending={isPending}
          onSubmit={handleSubmit}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <SubmitButton
            isPending={isPending}
            label="更新"
            pendingLabel="更新中..."
            form="category-form"
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
