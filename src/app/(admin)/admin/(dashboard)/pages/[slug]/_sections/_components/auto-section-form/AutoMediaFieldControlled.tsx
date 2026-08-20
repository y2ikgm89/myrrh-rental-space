"use client";

import {
  HiddenControlInput,
  useTypedControl,
} from "@/shared/lib/conform/control";
import type { MediaAcceptType } from "@/shared/lib/sections/types";

import { AutoMediaField } from "../auto-fields/AutoMediaField";
import type { ControlledFieldProps } from "./types";

export function AutoMediaFieldControlled({
  field,
  fieldId,
  label,
  accept,
  helpText,
  isPending,
  error,
}: ControlledFieldProps & { readonly accept: MediaAcceptType }) {
  const control = useTypedControl(field);
  const currentValue = typeof control.value === "string" ? control.value : "";

  return (
    <div className="space-y-2">
      <HiddenControlInput field={field} control={control} />
      <AutoMediaField
        fieldId={fieldId}
        label={label}
        accept={accept}
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
