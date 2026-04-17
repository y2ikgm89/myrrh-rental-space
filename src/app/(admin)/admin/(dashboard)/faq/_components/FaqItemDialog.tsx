"use client";

/**
 * FaqItemDialog
 *
 * 質問の作成・編集を Dialog で行う共用コンポーネント。
 * カテゴリ詳細ページ (/admin/faq/[categoryId]) から起動される前提で、
 * 所属カテゴリはページ側の context（`categoryId` prop）から注入される。
 * カテゴリ変更は bulk move Dialog で行うため、この Dialog には
 * カテゴリ選択フィールドを置かない。
 *
 * Radix Dialog controlled パターン準拠:
 * https://www.radix-ui.com/primitives/docs/components/dialog
 */

import { useWatch } from "react-hook-form";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { createFaqItem, updateFaqItem } from "@/admin/actions/faq";
import {
  defaultFaqItemFormValues,
  faqItemFormSchema,
} from "@/admin/lib/validations/faq";
import { useFormAction } from "@/admin/hooks";
import type { FaqItemWithCategory } from "@/shared/domain/faq/types";
import { getPublishLabel } from "@/shared/lib/validations/enums/helpers";

type FaqItemDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mode: "create" | "edit";
  /** 所属カテゴリ ID — create / edit どちらも親から注入 */
  readonly categoryId: string;
  /** edit モード時の既存データ */
  readonly item?: FaqItemWithCategory;
};

export function FaqItemDialog({
  open,
  onOpenChange,
  mode,
  categoryId,
  item,
}: FaqItemDialogProps) {
  const { form, isPending, onSubmit } = useFormAction(
    faqItemFormSchema,
    async (data) => {
      if (mode === "create") return createFaqItem(data);
      return item
        ? updateFaqItem(item.id, data)
        : { error: "FAQ項目が見つかりません" };
    },
    {
      successMessage:
        mode === "create" ? "質問を作成しました" : "質問を更新しました",
      refresh: true,
      onSuccess: () => onOpenChange(false),
      defaultValues:
        mode === "edit" && item
          ? {
              categoryId: item.categoryId,
              question: item.question,
              answer: item.answer,
              order: item.order,
              isPublished: item.isPublished,
            }
          : {
              ...defaultFaqItemFormValues,
              categoryId,
            },
    },
  );

  const {
    register,
    formState: { errors, isDirty },
    setValue,
    control,
  } = form;

  const isPublished = useWatch({
    control,
    name: "isPublished",
    defaultValue: item?.isPublished ?? true,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "質問を追加" : "質問を編集"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "このカテゴリに新しい質問を追加します"
              : "質問と回答を編集します"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* categoryId は親から固定。RHF 管理のため hidden input で保持 */}
          <input type="hidden" {...register("categoryId")} />

          <div className="space-y-2">
            <Label htmlFor="faq-item-question">質問 *</Label>
            <Input
              id="faq-item-question"
              {...register("question")}
              placeholder="例: 予約はいつまでキャンセルできますか？"
              disabled={isPending}
              aria-invalid={!!errors.question}
            />
            {errors.question && (
              <p className="text-xs text-destructive">
                {errors.question.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="faq-item-answer">回答 *</Label>
            <Textarea
              id="faq-item-answer"
              {...register("answer")}
              placeholder="回答を入力してください。改行は公開ページでも保持されます。"
              rows={8}
              disabled={isPending}
              aria-invalid={!!errors.answer}
            />
            {errors.answer && (
              <p className="text-xs text-destructive">
                {errors.answer.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              プレーンテキストのみ。改行は保持されます（5000 文字以内）。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="faq-item-order">表示順</Label>
            <Input
              id="faq-item-order"
              type="number"
              {...register("order", { valueAsNumber: true })}
              placeholder="0"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              小さい数字が先に表示されます
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Switch
              checked={isPublished}
              onCheckedChange={(checked) =>
                setValue("isPublished", checked, { shouldDirty: true })
              }
              disabled={isPending}
            />
            <div>
              <p className="font-medium">{getPublishLabel(isPublished)}</p>
              <p className="text-sm text-muted-foreground">
                {isPublished
                  ? "この質問は公開ページに表示されます"
                  : "この質問は公開ページに表示されません"}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={isPending}
              label={mode === "create" ? "作成" : "更新"}
              pendingLabel={mode === "create" ? "作成中..." : "更新中..."}
              {...(mode === "edit" && { disabled: !isDirty })}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
