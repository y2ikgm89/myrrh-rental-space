"use client";

import { Label } from "@/admin/components/ui";
import {
  HiddenControlInput,
  useTypedControl,
} from "@/shared/lib/conform/control";

import { IconPickerField } from "./dynamic-imports";
import type { ControlledFieldProps } from "./types";

export function AutoIconField({
  field,
  fieldId,
  label,
  helpText,
  isPending,
  error,
}: ControlledFieldProps) {
  const control = useTypedControl(field);
  const value = typeof control.value === "string" ? control.value : "";

  return (
    <div className="space-y-2">
      <HiddenControlInput field={field} control={control} />
      <Label htmlFor={fieldId}>{label}</Label>
      <IconPickerField
        id={fieldId}
        value={value}
        onChange={(name) => control.change(name)}
        disabled={isPending}
      />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
      {error && (
        <p id={field.errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
