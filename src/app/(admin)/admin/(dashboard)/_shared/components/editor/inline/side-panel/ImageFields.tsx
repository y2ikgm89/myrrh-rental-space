"use client";

/**
 * サムネイル画像フィールド
 *
 * conform `FieldMetadata` ベース。投稿記事用のサムネイル画像設定。
 * OGP画像はOGPFieldsで管理。
 */

import Image from "next/image";
import { IconPhotoPlus } from "@tabler/icons-react";
import { useInputControl, type FieldMetadata } from "@conform-to/react";
import { Button, Label } from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";

type ImageFieldsProps = {
  thumbnailUrlField: FieldMetadata<string>;
  disabled?: boolean;
};

export function ImageFields({ thumbnailUrlField, disabled }: ImageFieldsProps) {
  const errorMessage = thumbnailUrlField.errors?.[0];
  const control = useInputControl(thumbnailUrlField);
  const thumbnailUrl = typeof control.value === "string" ? control.value : "";

  const thumbnailPicker = useSingleMediaPicker({
    accept: "image",
    defaultUsage: "POST",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        control.change(selected.url);
      }
    },
  });

  return (
    <div className="space-y-2">
      <Label htmlFor={thumbnailUrlField.id}>サムネイル</Label>
      <input type="hidden" name={thumbnailUrlField.name} value={thumbnailUrl} />
      <div className="flex items-start gap-3">
        {thumbnailUrl ? (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border">
            <Image
              src={thumbnailUrl}
              alt="サムネイル"
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted">
            <IconPhotoPlus className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 space-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => thumbnailPicker.openPicker()}
            disabled={disabled}
          >
            <IconPhotoPlus className="mr-1 h-3 w-3" />
            選択
          </Button>
          {thumbnailUrl && (
            <p className="truncate text-xs text-muted-foreground">
              {thumbnailUrl}
            </p>
          )}
        </div>
      </div>
      {errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}

      {thumbnailPicker.mediaPickerDialog}
    </div>
  );
}
