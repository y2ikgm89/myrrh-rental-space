"use client";

import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Textarea,
  Label,
  Switch,
  SubmitButton,
} from "@/admin/components/ui";
import {
  faqCategoryFormSchema,
  defaultFaqCategoryFormValues,
} from "@/admin/lib/validations/faq";
import { createFaqCategory, updateFaqCategory } from "@/admin/actions/faq";
import { useFormAction } from "@/admin/hooks";
import type { FaqCategoryWithItems } from "@/shared/domain/faq/types";

type FaqCategoryFormProps = {
  category?: FaqCategoryWithItems;
  mode: "create" | "edit";
};

export function FaqCategoryForm({ category, mode }: FaqCategoryFormProps) {
  const router = useRouter();

  const { form, isPending, onSubmit } = useFormAction(
    faqCategoryFormSchema,
    async (data) => {
      if (mode === "create") return createFaqCategory(data);
      return category
        ? updateFaqCategory(category.id, data)
        : { error: "カテゴリが見つかりません" };
    },
    {
      redirectTo: "/admin/faq",
      successMessage:
        mode === "create" ? "カテゴリを作成しました" : "カテゴリを更新しました",
      defaultValues: category
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
    formState: { errors },
    setValue,
    control,
  } = form;

  const isActive = useWatch({
    control,
    name: "isActive",
    defaultValue: category?.isActive ?? true,
  });

  // 名前からスラッグを自動生成（新規作成時のみ）
  // NFD 正規化で日本語・アクセント文字を除去し、半角英数字+ハイフンに正規化
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
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>カテゴリ情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">カテゴリ名 *</Label>
            <Input
              id="name"
              {...register("name", {
                onChange: handleNameChange,
              })}
              placeholder="例: ご予約について"
              disabled={isPending}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
            {errors.name && (
              <p id="name-error" className="text-xs text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">スラッグ *</Label>
            <Input
              id="slug"
              {...register("slug")}
              placeholder="例: reservation"
              disabled={isPending}
              aria-invalid={!!errors.slug}
              aria-describedby={errors.slug ? "slug-error" : "slug-hint"}
            />
            <p id="slug-hint" className="text-xs text-muted-foreground">
              URLに使用される識別子です（半角英数字とハイフンのみ）
            </p>
            {errors.slug && (
              <p id="slug-error" className="text-xs text-destructive">
                {errors.slug.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="iconEmoji">アイコン（絵文字）</Label>
            <Input
              id="iconEmoji"
              {...register("iconEmoji")}
              placeholder="例: 🏠 🎯 ⭐"
              maxLength={4}
              disabled={isPending}
              aria-describedby="iconEmoji-hint"
              className="w-24 text-center text-xl"
            />
            <p id="iconEmoji-hint" className="text-xs text-muted-foreground">
              1
              文字の絵文字を入力できます（任意）。一覧と公開ページに表示されます。
            </p>
            {errors.iconEmoji && (
              <p className="text-xs text-destructive">
                {errors.iconEmoji.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">説明</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="カテゴリの説明（オプション）"
              rows={3}
              disabled={isPending}
              aria-invalid={!!errors.description}
              aria-describedby={
                errors.description ? "description-error" : undefined
              }
            />
            {errors.description && (
              <p id="description-error" className="text-xs text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="order">表示順</Label>
            <Input
              id="order"
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
              onCheckedChange={(checked) => setValue("isActive", checked)}
              disabled={isPending}
            />
            <div>
              <p className="font-medium">{isActive ? "公開中" : "非公開"}</p>
              <p className="text-sm text-muted-foreground">
                {isActive
                  ? "このカテゴリは公開ページに表示されます"
                  : "このカテゴリは公開ページに表示されません"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          キャンセル
        </Button>
        <SubmitButton
          isPending={isPending}
          label={mode === "create" ? "作成" : "更新"}
          pendingLabel={mode === "create" ? "作成中..." : "更新中..."}
          {...(mode === "edit" && { disabled: !form.formState.isDirty })}
        />
      </div>
    </form>
  );
}
