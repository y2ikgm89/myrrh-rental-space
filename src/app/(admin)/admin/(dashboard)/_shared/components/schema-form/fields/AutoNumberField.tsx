"use client";

import type { ReactElement } from "react";
import { Input } from "@/admin/components/ui/input";
import { Label } from "@/admin/components/ui/label";
import type { FieldComponentProps } from "../FieldRenderer";

export function AutoNumberField({
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
      <Input
        id={inputId}
        type="number"
        min={field.min}
        max={field.max}
        placeholder={field.placeholder}
        disabled={isPending}
        {...register(field.name, { valueAsNumber: true })}
      />
      {error?.message && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}
    </div>
  );
}
