"use client";

/**
 * AutoSelectField — useController ベースの制御された Select
 *
 * static options（schema 由来）と dynamic options（DB 由来）の両方をサポート。
 * dynamicOptions が渡された場合、先頭に「（指定なし）」エントリ + DB 値を options
 * として描画する（static options は使わない）。
 */

import { z } from "zod";
import { useController, type Control, type FieldValues } from "react-hook-form";
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
  fieldKey,
  fieldId,
  label,
  placeholder,
  helpText,
  schema,
  control,
  isPending,
  error,
  dynamicOptions,
}: {
  readonly fieldKey: string;
  readonly fieldId: string;
  readonly label: string;
  readonly placeholder: string | undefined;
  readonly helpText: string | undefined;
  readonly schema: z.ZodType;
  readonly control: Control<FieldValues>;
  readonly isPending: boolean;
  readonly error: string | undefined;
  readonly dynamicOptions?: ReadonlyArray<DynamicCategoryOption>;
}) {
  const { field } = useController({ control, name: fieldKey });
  const isDynamic = dynamicOptions !== undefined;
  const staticOptions = isDynamic ? [] : getSelectOptions(schema);

  // Radix Select は value="" を placeholder 用に予約しているため、空文字を
  // sentinel 値（DYNAMIC_NONE_VALUE）にマッピングする。dynamic mode 時のみ使用。
  const selectValue =
    isDynamic && field.value === ""
      ? DYNAMIC_NONE_VALUE
      : typeof field.value === "string"
        ? field.value
        : undefined;

  const handleValueChange = (value: string) => {
    if (isDynamic && value === DYNAMIC_NONE_VALUE) {
      field.onChange("");
      return;
    }
    field.onChange(value);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Select
        {...(selectValue !== undefined && { value: selectValue })}
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
