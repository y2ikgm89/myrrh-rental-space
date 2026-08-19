"use client";

import {
  HiddenControlInput,
  useTypedControl,
} from "@/shared/lib/conform/control";

import { AutoImageField } from "../auto-fields/AutoImageField";
import type { ControlledFieldProps } from "./types";

export function AutoImageFieldControlled({
  field,
  fieldId,
  label,
  helpText,
  isPending,
  error,
}: ControlledFieldProps) {
  const control = useTypedControl(field);
  const currentValue = typeof control.value === "string" ? control.value : "";

  return (
    <div className="space-y-2">
      <HiddenControlInput field={field} control={control} />
      <AutoImageField
        fieldId={fieldId}
        label={label}
        value={currentValue.length > 0 ? currentValue : undefined}
        onSelect={(url) => control.change(url)}
        {...(helpText !== undefined && { helpText })}
        {...(isPending && { disabled: true })}
      />
      {error && (
        <p id={field.errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
