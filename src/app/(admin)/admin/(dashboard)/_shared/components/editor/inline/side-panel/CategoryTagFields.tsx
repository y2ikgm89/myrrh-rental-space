"use client";

/**
 * カテゴリ・タグフィールド（投稿記事用 — シンプル合成版）
 *
 * conform `FieldMetadata` ベース。`CategoryFields` + `<Input>` (タグはカンマ区切り
 * 文字列の簡易版、`PostTagFields` の TagInput UI を使わないケース向け)。
 */

import {
  getInputProps,
  useInputControl,
  type FieldMetadata,
} from "@conform-to/react";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";

export type CategoryOption = {
  id: string;
  name: string;
};

type CategoryTagFieldsProps = {
  categoryIdField: FieldMetadata<string>;
  tagsField: FieldMetadata<string | undefined>;
  categories: readonly CategoryOption[];
  disabled?: boolean;
};

export function CategoryTagFields({
  categoryIdField,
  tagsField,
  categories,
  disabled,
}: CategoryTagFieldsProps) {
  const categoryControl = useInputControl(categoryIdField);
  const categoryId =
    typeof categoryControl.value === "string" ? categoryControl.value : "";
  const categoryError = categoryIdField.errors?.[0];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={categoryIdField.id}>カテゴリ</Label>
        <input type="hidden" name={categoryIdField.name} value={categoryId} />
        <Select
          value={categoryId}
          onValueChange={(value) => categoryControl.change(value)}
          {...(disabled !== undefined && { disabled })}
        >
          <SelectTrigger>
            <SelectValue placeholder="カテゴリを選択" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {categoryError && (
          <p className="text-sm text-destructive">{categoryError}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={tagsField.id}>タグ</Label>
        <Input
          {...getInputProps(tagsField, { type: "text" })}
          placeholder="タグ1, タグ2, タグ3"
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">カンマ区切りで入力</p>
      </div>
    </div>
  );
}
