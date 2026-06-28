"use client";

/**
 * 投稿タグ入力フィールド
 *
 * conform `FieldMetadata` ベース。`TagInput` UI primitive + UUID 配列 transit (FormData
 * 経由は JSON.stringify、schema preprocess で配列化、`@/admin/lib/validations/post`
 * の `tagsFormSchema` 参照)。
 */

import type { FieldMetadata } from "@conform-to/react";
import { useTypedInputControl } from "@/shared/lib/conform/typed-input-control";
import { TagInput, type TagOption } from "./TagInput";

type PostTagFieldsProps = {
  tagsField: FieldMetadata<unknown>;
  /** 利用可能なタグのリスト */
  availableTags?: readonly TagOption[];
  /** 新規タグ作成時のコールバック */
  onCreateTag?: (name: string) => Promise<TagOption | null>;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
};

function parseTagsValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      // ignore
    }
  }
  return [];
}

export function PostTagFields({
  tagsField,
  availableTags = [],
  onCreateTag,
  label = "タグ",
  placeholder = "タグを入力...",
  disabled,
}: PostTagFieldsProps) {
  const control = useTypedInputControl(tagsField);
  const tagsArray = parseTagsValue(control.value);
  const tagsError = tagsField.errors?.[0];

  const handleChange = (newTags: string[]) => {
    control.change(JSON.stringify(newTags));
  };

  return (
    <>
      <input
        type="hidden"
        name={tagsField.name}
        value={JSON.stringify(tagsArray)}
      />
      <TagInput
        value={tagsArray}
        onChange={handleChange}
        availableTags={[...availableTags]}
        {...(onCreateTag && { onCreateTag })}
        label={label}
        placeholder={placeholder}
        {...(disabled !== undefined && { disabled })}
        {...(tagsError && { error: tagsError })}
      />
    </>
  );
}
