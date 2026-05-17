"use client";

/**
 * 抜粋/説明フィールド
 *
 * conform `FieldMetadata` ベース。汎用的なテキストエリア入力。
 */

import { getTextareaProps, type FieldMetadata } from "@conform-to/react";
import { Label, Textarea } from "@/admin/components/ui";

type ExcerptFieldsProps = {
  field: FieldMetadata<string | undefined>;
  label?: string;
  placeholder?: string;
  helpText?: string;
  rows?: number;
  disabled?: boolean;
};

export function ExcerptFields({
  field,
  label = "抜粋",
  placeholder = "抜粋を入力（一覧ページに表示）",
  helpText = "500文字以内",
  rows = 3,
  disabled,
}: ExcerptFieldsProps) {
  const errorMessage = field.errors?.[0];

  return (
    <div className="space-y-2">
      <Label htmlFor={field.id}>{label}</Label>
      <Textarea
        {...getTextareaProps(field)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
      />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}
