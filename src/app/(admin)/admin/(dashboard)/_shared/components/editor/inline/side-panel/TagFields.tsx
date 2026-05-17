"use client";

/**
 * タグ入力フィールド（News 用、シンプルなテキスト入力）
 *
 * conform `FieldMetadata` ベース。
 */

import { getInputProps, type FieldMetadata } from "@conform-to/react";
import { Input, Label } from "@/admin/components/ui";

type TagFieldsProps = {
  tagsField: FieldMetadata<string | undefined>;
  label?: string;
  placeholder?: string;
  helpText?: string;
  disabled?: boolean;
};

export function TagFields({
  tagsField,
  label = "タグ",
  placeholder = "タグ1, タグ2, タグ3",
  helpText = "カンマ区切りで入力",
  disabled,
}: TagFieldsProps) {
  const tagsError = tagsField.errors?.[0];

  return (
    <div className="space-y-2">
      <Label htmlFor={tagsField.id}>{label}</Label>
      <Input
        {...getInputProps(tagsField, { type: "text" })}
        placeholder={placeholder}
        disabled={disabled}
      />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {tagsError && <p className="text-sm text-destructive">{tagsError}</p>}
    </div>
  );
}
