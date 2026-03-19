"use client";

import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Input, Textarea, Label } from "@/admin/components/ui";
import {
  spaceCategoryFormSchema,
  defaultSpaceCategoryFormValues,
  type SpaceCategoryFormInput,
  type SpaceCategoryWithStats,
} from "@/shared/lib/validations/space-category";

type CategoryFormProps = {
  category?: SpaceCategoryWithStats;
  isPending: boolean;
  onSubmit: (data: SpaceCategoryFormInput) => void;
};

export function CategoryForm({
  category,
  isPending,
  onSubmit,
}: CategoryFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SpaceCategoryFormInput>({
    resolver: standardSchemaResolver(spaceCategoryFormSchema),
    defaultValues: category
      ? {
          name: category.name,
          description: category.description ?? "",
          icon: category.icon ?? "",
          color: category.color ?? "",
          sortOrder: category.sortOrder,
        }
      : defaultSpaceCategoryFormValues,
  });

  return (
    <form
      id="category-form"
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="name">カテゴリー名 *</Label>
        <Input
          id="name"
          {...register("name")}
          placeholder="例: 会議室"
          disabled={isPending}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">説明</Label>
        <Textarea
          id="description"
          {...register("description")}
          placeholder="カテゴリーの説明（オプション）"
          rows={3}
          disabled={isPending}
        />
        {errors.description && (
          <p className="text-sm text-destructive">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="icon">アイコン名</Label>
          <Input
            id="icon"
            {...register("icon")}
            placeholder="例: building"
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            アイコン名を入力（Lucide icons）
          </p>
          {errors.icon && (
            <p className="text-sm text-destructive">{errors.icon.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="color">色</Label>
          <div className="flex items-center gap-2">
            <Input
              id="color"
              type="color"
              {...register("color")}
              className="h-10 w-16 cursor-pointer p-1"
              disabled={isPending}
            />
            <Input
              {...register("color")}
              placeholder="#3B82F6"
              className="flex-1"
              disabled={isPending}
            />
          </div>
          {errors.color && (
            <p className="text-sm text-destructive">{errors.color.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sortOrder">並び順</Label>
        <Input
          id="sortOrder"
          type="number"
          {...register("sortOrder", { valueAsNumber: true })}
          placeholder="0"
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">
          小さい数字が先に表示されます
        </p>
        {errors.sortOrder && (
          <p className="text-sm text-destructive">{errors.sortOrder.message}</p>
        )}
      </div>
    </form>
  );
}
