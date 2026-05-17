"use client";

/**
 * OGP設定フィールド
 *
 * conform `FieldMetadata` ベース。SNSシェア時の表示設定。OGP画像はメディアピッカーで選択。
 */

import Image from "next/image";
import { IconPhotoPlus } from "@tabler/icons-react";
import {
  getInputProps,
  getTextareaProps,
  useInputControl,
  type FieldMetadata,
} from "@conform-to/react";
import { Button, Input, Label, Textarea } from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";

type OGPFieldsProps = {
  ogpTitleField: FieldMetadata<string | undefined>;
  ogpDescriptionField: FieldMetadata<string | undefined>;
  ogpImageUrlField: FieldMetadata<string | null | undefined>;
  disabled?: boolean;
};

export function OGPFields({
  ogpTitleField,
  ogpDescriptionField,
  ogpImageUrlField,
  disabled,
}: OGPFieldsProps) {
  const ogpTitleError = ogpTitleField.errors?.[0];
  const ogpDescriptionError = ogpDescriptionField.errors?.[0];
  const ogpImageUrlError = ogpImageUrlField.errors?.[0];

  const ogpImageControl = useInputControl(ogpImageUrlField);
  const ogpImageUrlStr =
    typeof ogpImageControl.value === "string" ? ogpImageControl.value : "";

  const ogpPicker = useSingleMediaPicker({
    defaultUsage: "POST",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        ogpImageControl.change(selected.url);
      }
    },
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={ogpTitleField.id}>OGPタイトル</Label>
        <Input
          {...getInputProps(ogpTitleField, { type: "text" })}
          placeholder="SNSシェア時のタイトル（100文字以内推奨）"
          disabled={disabled}
        />
        {ogpTitleError && (
          <p className="text-sm text-destructive">{ogpTitleError}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={ogpDescriptionField.id}>OGP説明文</Label>
        <Textarea
          {...getTextareaProps(ogpDescriptionField)}
          placeholder="SNSシェア時の説明文（200文字以内推奨）"
          rows={3}
          disabled={disabled}
        />
        {ogpDescriptionError && (
          <p className="text-sm text-destructive">{ogpDescriptionError}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>OGP画像</Label>
        <input
          type="hidden"
          name={ogpImageUrlField.name}
          value={ogpImageUrlStr}
        />
        <div className="flex items-start gap-3">
          {ogpImageUrlStr ? (
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border">
              <Image
                src={ogpImageUrlStr}
                alt="OGP画像"
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
              onClick={() => ogpPicker.openPicker()}
              disabled={disabled}
            >
              <IconPhotoPlus className="mr-1 h-3 w-3" />
              選択
            </Button>
            {ogpImageUrlStr && (
              <p className="truncate text-xs text-muted-foreground">
                {ogpImageUrlStr}
              </p>
            )}
          </div>
        </div>
        {ogpImageUrlError && (
          <p className="text-sm text-destructive">{ogpImageUrlError}</p>
        )}
        <p className="text-xs text-muted-foreground">推奨サイズ: 1200x630px</p>
      </div>

      {ogpPicker.mediaPickerDialog}
    </div>
  );
}
