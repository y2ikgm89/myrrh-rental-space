"use client";

/**
 * 基本情報フィールド（投稿記事用）
 *
 * conform `FieldMetadata` ベース。タイトル + スラッグ + 抜粋。
 * スラッグの自動生成は親フォームから渡される `onAutoGenerateSlug` callback で実行。
 */

import {
  getInputProps,
  getTextareaProps,
  type FieldMetadata,
} from "@conform-to/react";
import { Button, Input, Label, Textarea } from "@/admin/components/ui";
import { generatePostUrl } from "@/shared/lib/url";

type BasicInfoFieldsProps = {
  titleField: FieldMetadata<string>;
  slugField: FieldMetadata<string>;
  excerptField: FieldMetadata<string | undefined>;
  /** 「自動生成」ボタンが押されたときの callback (親で title から slug を生成して form.update する) */
  onAutoGenerateSlug: () => void;
  /** スラッグの URL プレビュー (例: "article-slug") */
  slugPreview?: string;
  disabled?: boolean;
};

export function BasicInfoFields({
  titleField,
  slugField,
  excerptField,
  onAutoGenerateSlug,
  slugPreview,
  disabled,
}: BasicInfoFieldsProps) {
  const titleError = titleField.errors?.[0];
  const slugError = slugField.errors?.[0];
  const excerptError = excerptField.errors?.[0];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={titleField.id}>タイトル</Label>
        <Input
          {...getInputProps(titleField, { type: "text" })}
          placeholder="記事のタイトル"
          disabled={disabled}
        />
        {titleError && <p className="text-sm text-destructive">{titleError}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={slugField.id}>スラッグ（URL）</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAutoGenerateSlug}
            disabled={disabled}
          >
            自動生成
          </Button>
        </div>
        <Input
          {...getInputProps(slugField, { type: "text" })}
          placeholder="article-slug"
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          URLに使用されます:{" "}
          {generatePostUrl({ slug: slugPreview || "article-slug" })}
        </p>
        {slugError && <p className="text-sm text-destructive">{slugError}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor={excerptField.id}>抜粋</Label>
        <Textarea
          {...getTextareaProps(excerptField)}
          placeholder="記事の抜粋（一覧ページに表示）"
          rows={3}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">500文字以内</p>
        {excerptError && (
          <p className="text-sm text-destructive">{excerptError}</p>
        )}
      </div>
    </div>
  );
}
