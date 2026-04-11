"use client";

/**
 * AutoSelectField — useController ベースの制御された Select
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
}) {
  const { field } = useController({ control, name: fieldKey });
  const options = getSelectOptions(schema);

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Select
        {...(typeof field.value === "string" && { value: field.value })}
        onValueChange={field.onChange}
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
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
