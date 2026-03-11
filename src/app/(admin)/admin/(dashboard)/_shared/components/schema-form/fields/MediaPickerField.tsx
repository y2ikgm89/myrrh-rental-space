"use client";

import type { ReactElement } from "react";
import { Label } from "@/admin/components/ui/label";
import { Input } from "@/admin/components/ui/input";
import { Button } from "@/admin/components/ui/button";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import type { SelectedMedia } from "@/admin/types/media-picker";
import type { FieldComponentProps } from "../FieldRenderer";

export function MediaPickerField({
  field,
  register,
  error,
  isPending,
  setValue,
}: FieldComponentProps): ReactElement {
  const inputId = `field-${field.name}`;

  const handleSelect = (media: SelectedMedia[]) => {
    const selected = media[0];
    if (selected) {
      setValue(field.name, selected.url, { shouldValidate: true });
    }
  };

  const mediaPicker = useSingleMediaPicker({ onSelect: handleSelect });

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="text"
          placeholder={field.placeholder ?? "https://..."}
          disabled={isPending}
          {...register(field.name)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => mediaPicker.openPicker()}
        >
          選択
        </Button>
      </div>
      {error?.message && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}
      <mediaPicker.MediaPicker />
    </div>
  );
}
