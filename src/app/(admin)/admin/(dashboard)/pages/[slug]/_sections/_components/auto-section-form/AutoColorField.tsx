"use client";

import { Input, Label } from "@/admin/components/ui";
import {
  HiddenControlInput,
  useTypedControl,
} from "@/shared/lib/conform/control";

import type { ControlledFieldProps } from "./types";

export function AutoColorField({
  field,
  fieldId,
  label,
  placeholder,
  helpText,
  isPending,
  error,
}: ControlledFieldProps & { readonly placeholder: string | undefined }) {
  const control = useTypedControl(field);
  const colorValue =
    typeof control.value === "string" && control.value.length > 0
      ? control.value
      : "";
  const swatchValue = colorValue || "#000000";

  return (
    <div className="space-y-2">
      <HiddenControlInput field={field} control={control} />
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          id={`${fieldId}-picker`}
          className="h-9 w-12 cursor-pointer rounded border p-1"
          value={swatchValue}
          onChange={(e) => control.change(e.target.value)}
          disabled={isPending}
          aria-label={`${label} カラーピッカー`}
        />
        <Input
          id={fieldId}
          value={colorValue}
          onChange={(e) => control.change(e.target.value)}
          onBlur={control.blur}
          placeholder={placeholder ?? "#000000"}
          disabled={isPending}
          className="flex-1"
        />
      </div>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {error && (
        <p id={field.errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
