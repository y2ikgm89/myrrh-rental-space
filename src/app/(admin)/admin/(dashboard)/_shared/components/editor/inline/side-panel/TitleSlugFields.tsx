"use client";

/**
 * タイトル・スラッグフィールド
 *
 * conform `FieldMetadata` ベース。汎用的なタイトルとスラッグの入力フィールド。
 * スラッグの自動生成は親フォームから渡される `onAutoGenerateSlug` callback で実行。
 */

import { getInputProps, type FieldMetadata } from "@conform-to/react";
import { Button, Input, Label } from "@/admin/components/ui";

type TitleSlugFieldsProps = {
  titleField: FieldMetadata<string>;
  /** slug 不要の場合は省略 */
  slugField?: FieldMetadata<string>;
  /** スラッグの URL プレビューパス */
  slugPreviewPath?: string;
  /** スラッグの現在値（URL プレビュー表示用） */
  slugPreviewValue?: string;
  /** タイトルのプレースホルダー */
  titlePlaceholder?: string;
  /** スラッグのプレースホルダー */
  slugPlaceholder?: string;
  /** 「自動生成」ボタンが押されたときの callback */
  onAutoGenerateSlug?: () => void;
  disabled?: boolean;
};

export function TitleSlugFields({
  titleField,
  slugField,
  slugPreviewPath = "",
  slugPreviewValue = "",
  titlePlaceholder = "タイトルを入力",
  slugPlaceholder = "url-slug",
  onAutoGenerateSlug,
  disabled,
}: TitleSlugFieldsProps) {
  const titleError = titleField.errors?.[0];
  const slugError = slugField?.errors?.[0];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={titleField.id}>タイトル</Label>
        <Input
          {...getInputProps(titleField, { type: "text" })}
          placeholder={titlePlaceholder}
          disabled={disabled}
        />
        {titleError && <p className="text-sm text-destructive">{titleError}</p>}
      </div>

      {slugField && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={slugField.id}>スラッグ（URL）</Label>
            {onAutoGenerateSlug && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onAutoGenerateSlug}
                disabled={disabled}
              >
                自動生成
              </Button>
            )}
          </div>
          <Input
            {...getInputProps(slugField, { type: "text" })}
            placeholder={slugPlaceholder}
            disabled={disabled}
          />
          {slugPreviewPath && (
            <p className="text-xs text-muted-foreground">
              URL: {slugPreviewPath}/{slugPreviewValue || slugPlaceholder}
            </p>
          )}
          {slugError && <p className="text-sm text-destructive">{slugError}</p>}
        </div>
      )}
    </div>
  );
}
