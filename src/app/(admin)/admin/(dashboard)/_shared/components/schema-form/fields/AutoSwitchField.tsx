"use client";

import type { ReactElement } from "react";
import { Controller } from "react-hook-form";
import { Label } from "@/admin/components/ui/label";
import { Switch } from "@/admin/components/ui/switch";
import type { FieldComponentProps } from "../FieldRenderer";

export function AutoSwitchField({
  field,
  control,
  error,
  isPending,
}: FieldComponentProps): ReactElement {
  const inputId = `field-${field.name}`;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Controller
          control={control}
          name={field.name}
          render={({ field: rhfField }) => (
            <Switch
              id={inputId}
              checked={rhfField.value === true}
              onCheckedChange={rhfField.onChange}
              disabled={isPending}
            />
          )}
        />
        <Label htmlFor={inputId}>
          {field.label}
          {field.required && <span className="ml-1 text-destructive">*</span>}
        </Label>
      </div>
      {error?.message && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}
    </div>
  );
}
