"use client";

/**
 * AutoSelectField — Radix Select ベースの select フィールド
 */

import { z } from "zod";
import { useForm } from "react-hook-form";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { getSelectOptions } from "../zod-introspection";

export function AutoSelectField({
  fieldKey,
  fieldId,
  label,
  placeholder,
  helpText,
  schema,
  setValue,
  isPending,
  defaultValue,
}: {
  readonly fieldKey: string;
  readonly fieldId: string;
  readonly label: string;
  readonly placeholder: string | undefined;
  readonly helpText: string | undefined;
  readonly schema: z.ZodType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly setValue: ReturnType<typeof useForm<any>>["setValue"];
  readonly isPending: boolean;
  readonly defaultValue: unknown;
}) {
  const options = getSelectOptions(schema);

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Select
        {...(typeof defaultValue === "string" && {
          defaultValue,
        })}
        onValueChange={(v) => setValue(fieldKey, v)}
        disabled={isPending}
      >
        <SelectTrigger id={fieldId}>
          <SelectValue placeholder={placeholder ?? "選択してください"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}
