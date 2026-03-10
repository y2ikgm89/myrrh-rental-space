"use client";

/**
 * カテゴリ・タグフィールド
 *
 * カテゴリ選択とタグ入力
 * 投稿記事用
 */

import type {
  UseFormRegister,
  UseFormSetValue,
  FieldErrors,
  Control,
} from "react-hook-form";
import { useWatch } from "react-hook-form";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import type { PostEditorFormData, PostCategoryOption } from "../types";

type CategoryTagFieldsProps = {
  register: UseFormRegister<PostEditorFormData>;
  control: Control<PostEditorFormData>;
  setValue: UseFormSetValue<PostEditorFormData>;
  errors: FieldErrors<PostEditorFormData>;
  categories: PostCategoryOption[];
  disabled?: boolean;
};

export function CategoryTagFields({
  register,
  control,
  setValue,
  errors,
  categories,
  disabled,
}: CategoryTagFieldsProps) {
  const categoryId = useWatch({ control, name: "categoryId" });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="categoryId">カテゴリ</Label>
        <Select
          value={categoryId}
          onValueChange={(value) =>
            setValue("categoryId", value, { shouldDirty: true })
          }
          {...(disabled !== undefined && { disabled })}
        >
          <SelectTrigger>
            <SelectValue placeholder="カテゴリを選択" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.categoryId && (
          <p className="text-sm text-destructive">
            {errors.categoryId.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">タグ</Label>
        <Input
          id="tags"
          {...register("tags")}
          placeholder="タグ1, タグ2, タグ3"
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">カンマ区切りで入力</p>
      </div>
    </div>
  );
}
