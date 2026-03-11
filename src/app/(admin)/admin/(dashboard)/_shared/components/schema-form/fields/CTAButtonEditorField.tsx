"use client";

import type { ReactElement } from "react";
import { Controller } from "react-hook-form";
import { Label } from "@/admin/components/ui/label";
import { CTAButtonEditor } from "@/admin/components/cta-button-editor/CTAButtonEditor";
import type { FieldComponentProps } from "../FieldRenderer";

export function CTAButtonEditorField({
  field,
  control,
  error,
  isPending,
}: FieldComponentProps): ReactElement {
  return (
    <div className="space-y-2">
      <Label>
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Controller
        control={control}
        name={field.name}
        render={({ field: rhfField }) => (
          <CTAButtonEditor
            buttons={Array.isArray(rhfField.value) ? rhfField.value : []}
            onChange={rhfField.onChange}
            disabled={isPending}
          />
        )}
      />
      {error?.message && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}
    </div>
  );
}
