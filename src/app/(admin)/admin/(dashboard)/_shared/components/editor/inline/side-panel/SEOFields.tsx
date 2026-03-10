"use client";

/**
 * SEO設定フィールド
 *
 * メタディスクリプション、メタキーワードの編集
 * フィールド名をpropsで受け取ることで完全な型安全性を確保
 */

import type { FieldValues } from "react-hook-form";
import { Input, Label, Textarea } from "@/admin/components/ui";
import { getFieldError, getErrorMessage } from "../types";
import type { SEOFieldsProps } from "../types";

export function SEOFields<T extends FieldValues>({
  register,
  errors,
  disabled,
  fields,
}: SEOFieldsProps<T>) {
  const metaDescriptionError = getFieldError(errors, fields.metaDescription);
  const metaKeywordsError = getFieldError(errors, fields.metaKeywords);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="metaDescription">メタディスクリプション</Label>
        <Textarea
          id="metaDescription"
          {...register(fields.metaDescription)}
          placeholder="検索結果に表示される説明文（160文字以内推奨）"
          rows={3}
          disabled={disabled}
        />
        {metaDescriptionError && (
          <p className="text-sm text-destructive">
            {getErrorMessage(metaDescriptionError)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          検索エンジンの結果ページに表示される説明文です
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="metaKeywords">メタキーワード</Label>
        <Input
          id="metaKeywords"
          {...register(fields.metaKeywords)}
          placeholder="キーワード1, キーワード2, キーワード3"
          disabled={disabled}
        />
        {metaKeywordsError && (
          <p className="text-sm text-destructive">
            {getErrorMessage(metaKeywordsError)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          カンマ区切りでキーワードを入力
        </p>
      </div>
    </div>
  );
}
