"use client";

import type { ReactElement } from "react";
import { Label } from "@/admin/components/ui/label";
import type { FieldComponentProps } from "../FieldRenderer";

export function AutoSliderField({
  field,
  register,
  error,
  isPending,
}: FieldComponentProps): ReactElement {
  const inputId = `field-${field.name}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <input
        id={inputId}
        type="range"
        min={field.min}
        max={field.max}
        disabled={isPending}
        className="w-full accent-primary"
        {...register(field.name, { valueAsNumber: true })}
      />
      {error?.message && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}
    </div>
  );
}
