"use client";

import { useActionState, useEffect, useState } from "react";
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
import { CategoryForm } from "./CategoryForm";

const FORM_ID = "space-category-create-form";

export function CreateCategoryDialog() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [lastResult, formAction, isPending] = useActionState(
    createSpaceCategory,
    undefined,
  );

  // success を render 中 derive + close を render 中 sync で表現
  // (set-state-in-effect 違反回避、公式「Adjusting State During Render」パターン)
  const [previousLastResult, setPreviousLastResult] = useState(lastResult);
  if (lastResult !== previousLastResult) {
    setPreviousLastResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      setIsOpen(false);
    }
  }

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("作成しました");
      router.refresh();
    }
  }, [lastResult, router]);

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
        <CategoryForm
          isPending={isPending}
          lastResult={lastResult}
          formAction={formAction}
          formId={FORM_ID}
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
            label="作成"
            pendingLabel="作成中..."
            form={FORM_ID}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
