"use client";

import type { ReactElement } from "react";
import { Controller } from "react-hook-form";
import { Label } from "@/admin/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/admin/components/ui/select";
import type { FieldComponentProps } from "../FieldRenderer";

export function AutoSelectField({
  field,
  control,
  error,
  isPending,
}: FieldComponentProps): ReactElement {
  const inputId = `field-${field.name}`;
  const enumValues = field.enumValues ?? [];

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Controller
        control={control}
        name={field.name}
        render={({ field: rhfField }) => (
          <Select
            value={typeof rhfField.value === "string" ? rhfField.value : ""}
            onValueChange={rhfField.onChange}
            disabled={isPending}
          >
            <SelectTrigger id={inputId}>
              <SelectValue placeholder={field.placeholder ?? field.label} />
            </SelectTrigger>
            <SelectContent>
              {enumValues.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {error?.message && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}
    </div>
  );
}
