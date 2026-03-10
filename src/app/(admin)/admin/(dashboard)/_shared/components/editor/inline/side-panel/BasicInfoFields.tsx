"use client";

/**
 * 基本情報フィールド
 *
 * タイトル、スラッグ、抜粋の編集
 * 投稿記事用
 */

import type {
  UseFormRegister,
  UseFormGetValues,
  UseFormSetValue,
  FieldErrors,
} from "react-hook-form";
import { Input, Label, Textarea, Button } from "@/admin/components/ui";
import type { PostEditorFormData } from "../types";

type BasicInfoFieldsProps = {
  register: UseFormRegister<PostEditorFormData>;
  getValues: UseFormGetValues<PostEditorFormData>;
  setValue: UseFormSetValue<PostEditorFormData>;
  errors: FieldErrors<PostEditorFormData>;
  disabled?: boolean;
};

export function BasicInfoFields({
  register,
  getValues,
  setValue,
  errors,
  disabled,
}: BasicInfoFieldsProps) {
  const generateSlug = () => {
    const title = getValues("title");
    if (title) {
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
      setValue("slug", slug, { shouldDirty: true });
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">タイトル</Label>
        <Input
          id="title"
          {...register("title")}
          placeholder="記事のタイトル"
          disabled={disabled}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="slug">スラッグ（URL）</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={generateSlug}
            disabled={disabled}
          >
            自動生成
          </Button>
        </div>
        <Input
          id="slug"
          {...register("slug")}
          placeholder="article-slug"
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          URLに使用されます: /posts/{getValues("slug") || "article-slug"}
        </p>
        {errors.slug && (
          <p className="text-sm text-destructive">{errors.slug.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="excerpt">抜粋</Label>
        <Textarea
          id="excerpt"
          {...register("excerpt")}
          placeholder="記事の抜粋（一覧ページに表示）"
          rows={3}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">500文字以内</p>
        {errors.excerpt && (
          <p className="text-sm text-destructive">{errors.excerpt.message}</p>
        )}
      </div>
    </div>
  );
}
