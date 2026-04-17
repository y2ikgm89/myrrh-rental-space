"use client";

/**
 * FaqCategoryDialog
 *
 * FAQ カテゴリの作成・編集を Dialog で行う共用コンポーネント。
 * /admin/faq（一覧）と /admin/faq/[categoryId]（詳細）の両方から起動される。
 *
 * Radix Dialog の controlled パターンに準拠:
 * https://www.radix-ui.com/primitives/docs/components/dialog
 * - open / onOpenChange を親から制御
 * - 非同期送信成功時は onOpenChange(false) で閉じる
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
import { createFaqCategory, updateFaqCategory } from "@/admin/actions/faq";
import {
  defaultFaqCategoryFormValues,
  faqCategoryFormSchema,
} from "@/admin/lib/validations/faq";
import { useFormAction } from "@/admin/hooks";
import type { FaqCategoryWithItems } from "@/shared/domain/faq/types";
import { getPublishLabel } from "@/shared/lib/validations/enums/helpers";

type FaqCategoryDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mode: "create" | "edit";
  readonly category?: FaqCategoryWithItems;
};

export function FaqCategoryDialog({
  open,
  onOpenChange,
  mode,
  category,
}: FaqCategoryDialogProps) {
  const { form, isPending, onSubmit } = useFormAction(
    faqCategoryFormSchema,
    async (data) => {
      if (mode === "create") return createFaqCategory(data);
      return category
        ? updateFaqCategory(category.id, data)
        : { error: "カテゴリが見つかりません" };
    },
    {
      successMessage:
        mode === "create" ? "カテゴリを作成しました" : "カテゴリを更新しました",
      refresh: true,
      onSuccess: () => onOpenChange(false),
      defaultValues:
        mode === "edit" && category
          ? {
              name: category.name,
              slug: category.slug,
              description: category.description,
              iconEmoji: category.iconEmoji,
              order: category.order,
              isActive: category.isActive,
            }
          : defaultFaqCategoryFormValues,
    },
  );

  const {
    register,
    formState: { errors, isDirty },
    setValue,
    control,
  } = form;

  const isActive = useWatch({
    control,
    name: "isActive",
    defaultValue: category?.isActive ?? true,
  });

  // 名前からスラッグを自動生成（新規作成時のみ）
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (mode !== "create") return;
    const name = e.target.value;
    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100);
    setValue("slug", slug, { shouldDirty: true });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "カテゴリを作成" : "カテゴリを編集"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "新しい FAQ カテゴリを作成します"
              : "カテゴリ情報を編集します"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="faq-category-name">カテゴリ名 *</Label>
            <Input
              id="faq-category-name"
              {...register("name", {
                onChange: handleNameChange,
              })}
              placeholder="例: ご予約について"
              disabled={isPending}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="faq-category-slug">スラッグ *</Label>
            <Input
              id="faq-category-slug"
              {...register("slug")}
              placeholder="例: reservation"
              disabled={isPending}
              aria-invalid={!!errors.slug}
            />
            <p className="text-xs text-muted-foreground">
              URL に使用される識別子です（半角英数字とハイフンのみ）
            </p>
            {errors.slug && (
              <p className="text-xs text-destructive">{errors.slug.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="faq-category-icon">アイコン（絵文字）</Label>
            <Input
              id="faq-category-icon"
              {...register("iconEmoji")}
              placeholder="例: 🏠 🎯 ⭐"
              maxLength={4}
              disabled={isPending}
              className="w-24 text-center text-xl"
            />
            {errors.iconEmoji && (
              <p className="text-xs text-destructive">
                {errors.iconEmoji.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="faq-category-description">説明</Label>
            <Textarea
              id="faq-category-description"
              {...register("description")}
              placeholder="カテゴリの説明（オプション）"
              rows={2}
              disabled={isPending}
            />
            {errors.description && (
              <p className="text-xs text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="faq-category-order">表示順</Label>
            <Input
              id="faq-category-order"
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
              checked={isActive}
              onCheckedChange={(checked) =>
                setValue("isActive", checked, { shouldDirty: true })
              }
              disabled={isPending}
            />
            <div>
              <p className="font-medium">{getPublishLabel(isActive)}</p>
              <p className="text-sm text-muted-foreground">
                {isActive
                  ? "このカテゴリは公開ページに表示されます"
                  : "このカテゴリは公開ページに表示されません"}
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
