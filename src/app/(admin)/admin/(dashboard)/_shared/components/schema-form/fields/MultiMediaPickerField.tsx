"use client";

import type { ReactElement } from "react";
import { Controller } from "react-hook-form";
import { Label } from "@/admin/components/ui/label";
import { Button } from "@/admin/components/ui/button";
import { useMultipleMediaPicker } from "@/admin/hooks/use-media-picker";
import type { SelectedMedia } from "@/admin/types/media-picker";
import type { FieldComponentProps } from "../FieldRenderer";

export function MultiMediaPickerField({
  field,
  control,
  error,
  isPending,
  setValue,
}: FieldComponentProps): ReactElement {
  const inputId = `field-${field.name}`;

  const handleSelect = (media: SelectedMedia[]) => {
    setValue(
      field.name,
      media.map((m) => m.url),
      { shouldValidate: true },
    );
  };

  const mediaPicker = useMultipleMediaPicker({ onSelect: handleSelect });

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Controller
        control={control}
        name={field.name}
        render={({ field: rhfField }) => {
          const urls = Array.isArray(rhfField.value) ? rhfField.value : [];
          return (
            <div className="space-y-2">
              {urls.length > 0 && (
                <div className="rounded-md border border-input bg-muted/50 p-2 text-sm text-muted-foreground">
                  {urls.length} 件選択済み
                </div>
              )}
              <Button
                id={inputId}
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => mediaPicker.openPicker()}
              >
                画像を選択
              </Button>
            </div>
          );
        }}
      />
      {error?.message && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}
      <mediaPicker.MediaPicker />
    </div>
  );
}
