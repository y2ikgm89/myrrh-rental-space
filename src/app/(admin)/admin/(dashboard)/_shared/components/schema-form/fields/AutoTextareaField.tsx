"use client";

import type { ReactElement } from "react";
import { Textarea } from "@/admin/components/ui/textarea";
import { Label } from "@/admin/components/ui/label";
import type { FieldComponentProps } from "../FieldRenderer";

export function AutoTextareaField({
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
      <Textarea
        id={inputId}
        placeholder={field.placeholder}
        disabled={isPending}
        {...register(field.name)}
      />
      {error?.message && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}
    </div>
  );
}
