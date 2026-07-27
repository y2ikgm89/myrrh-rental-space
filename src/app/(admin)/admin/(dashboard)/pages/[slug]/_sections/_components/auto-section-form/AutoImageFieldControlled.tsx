"use client";

import { useTypedInputControl } from "@/shared/lib/conform/typed-input-control";

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
  const control = useTypedInputControl(field);
  const currentValue = typeof control.value === "string" ? control.value : "";

  return (
    <div className="space-y-2">
      <input type="hidden" name={field.name} value={currentValue} />
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
