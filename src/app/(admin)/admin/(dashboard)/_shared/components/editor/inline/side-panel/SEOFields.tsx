"use client";

/**
 * SEO設定フィールド
 *
 * conform `FieldMetadata` ベース。メタディスクリプション + メタキーワード。
 */

import {
  getInputProps,
  getTextareaProps,
  type FieldMetadata,
} from "@conform-to/react";
import { Input, Label, Textarea } from "@/admin/components/ui";

type SEOFieldsProps = {
  metaDescriptionField: FieldMetadata<string | undefined>;
  metaKeywordsField: FieldMetadata<string | undefined>;
  disabled?: boolean;
};

export function SEOFields({
  metaDescriptionField,
  metaKeywordsField,
  disabled,
}: SEOFieldsProps) {
  const metaDescriptionError = metaDescriptionField.errors?.[0];
  const metaKeywordsError = metaKeywordsField.errors?.[0];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={metaDescriptionField.id}>メタディスクリプション</Label>
        <Textarea
          {...getTextareaProps(metaDescriptionField)}
          placeholder="検索結果に表示される説明文（160文字以内推奨）"
          rows={3}
          disabled={disabled}
        />
        {metaDescriptionError && (
          <p className="text-sm text-destructive">{metaDescriptionError}</p>
        )}
        <p className="text-xs text-muted-foreground">
          検索エンジンの結果ページに表示される説明文です
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={metaKeywordsField.id}>メタキーワード</Label>
        <Input
          {...getInputProps(metaKeywordsField, { type: "text" })}
          placeholder="キーワード1, キーワード2, キーワード3"
          disabled={disabled}
        />
        {metaKeywordsError && (
          <p className="text-sm text-destructive">{metaKeywordsError}</p>
        )}
        <p className="text-xs text-muted-foreground">
          カンマ区切りでキーワードを入力
        </p>
      </div>
    </div>
  );
}
