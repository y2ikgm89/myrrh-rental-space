"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@tabler/icons-react";
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
import { createSpaceCategory } from "@/admin/actions/space-category";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { SpaceCategoryFormInput } from "@/shared/lib/validations/space-category";
import { CategoryForm } from "./CategoryForm";

export function CreateCategoryDialog() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = (data: SpaceCategoryFormInput) => {
    startTransition(async () => {
      const result = await createSpaceCategory(data);
      if (!isMutationError(result)) {
        toast.success("作成しました");
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
        <Button>
          <IconPlus className="mr-2 h-4 w-4" />
          カテゴリ追加
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>カテゴリー作成</DialogTitle>
        </DialogHeader>
        <CategoryForm isPending={isPending} onSubmit={handleSubmit} />
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
            label="作成"
            pendingLabel="作成中..."
            form="category-form"
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
