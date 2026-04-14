"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";
import { bulkMoveFaqItems } from "@/admin/actions/faq";
import { isMutationError } from "@/shared/lib/mutation-result";

type FaqBulkMoveDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly selectedIds: readonly string[];
  readonly categories: readonly { id: string; name: string }[];
  readonly onSuccess: () => void;
};

export function FaqBulkMoveDialog({
  open,
  onOpenChange,
  selectedIds,
  categories,
  onSuccess,
}: FaqBulkMoveDialogProps) {
  const [targetCategoryId, setTargetCategoryId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCategoryId) {
      toast.error("移動先カテゴリを選択してください");
      return;
    }

    startTransition(async () => {
      const result = await bulkMoveFaqItems({
        ids: [...selectedIds],
        newCategoryId: targetCategoryId,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.count} 件を移動しました`);
      setTargetCategoryId("");
      onSuccess();
    });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTargetCategoryId("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{selectedIds.length} 件の質問を移動</DialogTitle>
          <DialogDescription>
            選択した質問を別のカテゴリへ一括で移動します。移動先カテゴリの末尾に追加されます。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            value={targetCategoryId}
            onValueChange={setTargetCategoryId}
            disabled={isPending}
          >
            <SelectTrigger aria-label="移動先カテゴリを選択">
              <SelectValue placeholder="移動先カテゴリを選択" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={isPending}
              label="移動"
              pendingLabel="移動中..."
              disabled={!targetCategoryId}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
