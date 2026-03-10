"use client";

/**
 * タグ入力フィールド
 *
 * カンマ区切りのタグ入力
 */

import type { FieldValues, Path } from "react-hook-form";
import { Input, Label } from "@/admin/components/ui";
import { getFieldError, getErrorMessage } from "../types";
import type { FieldComponentProps } from "../content-types/types";

type TagFieldsProps<T extends FieldValues> = FieldComponentProps<T> & {
  /** フィールド名マッピング */
  fields: {
    tags: Path<T>;
  };
  /** ラベル */
  label?: string;
  /** プレースホルダー */
  placeholder?: string;
  /** ヘルプテキスト */
  helpText?: string;
};

export function TagFields<T extends FieldValues>({
  register,
  errors,
  disabled,
  fields,
  label = "タグ",
  placeholder = "タグ1, タグ2, タグ3",
  helpText = "カンマ区切りで入力",
}: TagFieldsProps<T>) {
  const tagsError = getFieldError(errors, fields.tags);

  return (
    <div className="space-y-2">
      <Label htmlFor={fields.tags}>{label}</Label>
      <Input
        id={fields.tags}
        {...register(fields.tags)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {tagsError && (
        <p className="text-sm text-destructive">{getErrorMessage(tagsError)}</p>
      )}
    </div>
  );
}
