"use client";

/**
 * FaqItemMoveDialog
 *
 * 単一の FAQ 質問を別カテゴリへ移動する Dialog。`FaqItemActionCell` の ⋯ メニュー
 * から起動される。一括移動の `bulkMoveFaqItems`（domain は `item-bulk-commands.ts`）を
 * 単体 id で再利用する（単体専用 command を増やさず SSoT を維持）。
 *
 * 現在のカテゴリは移動先候補から除外する（同一カテゴリへの移動は no-op のため）。
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

type FaqItemMoveDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly itemId: string;
  readonly question: string;
  readonly currentCategoryId: string;
  readonly categories: readonly { id: string; name: string }[];
};

export function FaqItemMoveDialog({
  open,
  onOpenChange,
  itemId,
  question,
  currentCategoryId,
  categories,
}: FaqItemMoveDialogProps) {
  const router = useRouter();
  const [targetCategoryId, setTargetCategoryId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const targetOptions = categories.filter((c) => c.id !== currentCategoryId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCategoryId) {
      toast.error("移動先カテゴリを選択してください");
      return;
    }

    startTransition(async () => {
      const result = await bulkMoveFaqItems({
        ids: [itemId],
        newCategoryId: targetCategoryId,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("質問を移動しました");
      setTargetCategoryId("");
      onOpenChange(false);
      router.refresh();
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
          <DialogTitle>質問を別カテゴリへ移動</DialogTitle>
          <DialogDescription>
            「{question}
            」を別のカテゴリへ移動します。移動先カテゴリの末尾に追加されます。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            value={targetCategoryId}
            onValueChange={setTargetCategoryId}
            disabled={isPending || targetOptions.length === 0}
          >
            <SelectTrigger aria-label="移動先カテゴリを選択">
              <SelectValue
                placeholder={
                  targetOptions.length === 0
                    ? "移動先カテゴリがありません"
                    : "移動先カテゴリを選択"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {targetOptions.map((category) => (
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
