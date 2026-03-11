"use client";

import type { ReactElement } from "react";
import { Input } from "@/admin/components/ui/input";
import { Label } from "@/admin/components/ui/label";
import type { FieldComponentProps } from "../FieldRenderer";

export function AutoColorField({
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
        type="text"
        placeholder={field.placeholder ?? "--color-primary"}
        disabled={isPending}
        {...register(field.name)}
      />
      {error?.message && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}
    </div>
  );
}
