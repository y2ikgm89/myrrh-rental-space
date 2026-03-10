"use client";

/**
 * 投稿タグ入力フィールド
 *
 * TagInputコンポーネントをreact-hook-formと統合
 * フォームのカンマ区切り文字列と配列形式を変換
 */

import type { FieldPathByValue, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";
import { TagInput, type TagOption } from "./TagInput";
import { getFieldError, getErrorMessage } from "../types";
import type { FieldComponentProps } from "../content-types/types";

type PostTagFieldsProps<T extends FieldValues> = FieldComponentProps<T> & {
  /** フィールド名マッピング */
  fields: {
    tags: FieldPathByValue<T, string | null | undefined>;
  };
  /** 利用可能なタグのリスト */
  availableTags?: TagOption[];
  /** 新規タグ作成時のコールバック */
  onCreateTag?: (name: string) => Promise<TagOption | null>;
  /** ラベル */
  label?: string;
  /** プレースホルダー */
  placeholder?: string;
};

export function PostTagFields<T extends FieldValues>({
  control,
  errors,
  disabled,
  fields,
  availableTags = [],
  onCreateTag,
  label = "タグ",
  placeholder = "タグを入力...",
}: PostTagFieldsProps<T>) {
  const tagsField = useController({ control, name: fields.tags });
  const rawTags: unknown = tagsField.field.value;
  const tagsString = typeof rawTags === "string" ? rawTags : undefined;
  const tagsError = getFieldError(errors, fields.tags);

  // カンマ区切り文字列を配列に変換
  const tagsArray = tagsString
    ? tagsString
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean)
    : [];

  // 配列をカンマ区切り文字列に変換してフォームに設定
  const handleChange = (newTags: string[]) => {
    const newValue = newTags.join(", ");
    tagsField.field.onChange(newValue);
  };

  return (
    <TagInput
      value={tagsArray}
      onChange={handleChange}
      availableTags={availableTags}
      {...(onCreateTag && { onCreateTag })}
      label={label}
      placeholder={placeholder}
      {...(disabled !== undefined && { disabled })}
      {...(tagsError && { error: getErrorMessage(tagsError) })}
    />
  );
}
