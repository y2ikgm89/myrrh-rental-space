"use client";

/**
 * AutoSelectField — conform useInputControl ベースの Select
 *
 * static options（schema 由来）と dynamic options（DB 由来）の両方をサポート。
 * dynamicOptions が渡された場合、先頭に「（指定なし）」エントリ + DB 値を options
 * として描画する（static options は使わない）。
 */

import { useInputControl, type FieldMetadata } from "@conform-to/react";
import type { z } from "zod";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { getSelectOptions } from "../zod-introspection";

const DYNAMIC_NONE_VALUE = "__none__";

interface DynamicCategoryOption {
  readonly id: string;
  readonly name: string;
}

export function AutoSelectField({
  field,
  fieldId,
  label,
  placeholder,
  helpText,
  schema,
  isPending,
  error,
  dynamicOptions,
}: {
  readonly field: FieldMetadata<unknown>;
  readonly fieldId: string;
  readonly label: string;
  readonly placeholder: string | undefined;
  readonly helpText: string | undefined;
  readonly schema: z.ZodType;
  readonly isPending: boolean;
  readonly error: string | undefined;
  readonly dynamicOptions?: ReadonlyArray<DynamicCategoryOption>;
}) {
  // conform useInputControl は string ベース FieldMetadata を要求するため境界変換
  const control = useInputControl(field as unknown as FieldMetadata<string>);
  const isDynamic = dynamicOptions !== undefined;
  const staticOptions = isDynamic ? [] : getSelectOptions(schema);

  // Radix Select は value="" を placeholder 用に予約しているため、空文字を
  // sentinel 値（DYNAMIC_NONE_VALUE）にマッピングする。dynamic mode 時のみ使用。
  const rawValue = typeof control.value === "string" ? control.value : "";
  const selectValue =
    isDynamic && rawValue === "" ? DYNAMIC_NONE_VALUE : rawValue;

  const handleValueChange = (value: string) => {
    if (isDynamic && value === DYNAMIC_NONE_VALUE) {
      control.change("");
      return;
    }
    control.change(value);
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name={field.name} value={rawValue} />
      <Label htmlFor={fieldId}>{label}</Label>
      <Select
        {...(selectValue.length > 0 && { value: selectValue })}
        onValueChange={handleValueChange}
        disabled={isPending}
      >
        <SelectTrigger id={fieldId}>
          <SelectValue placeholder={placeholder ?? "選択してください"} />
        </SelectTrigger>
        <SelectContent>
          {isDynamic ? (
            <>
              <SelectItem value={DYNAMIC_NONE_VALUE}>（指定なし）</SelectItem>
              {dynamicOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </>
          ) : (
            staticOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
