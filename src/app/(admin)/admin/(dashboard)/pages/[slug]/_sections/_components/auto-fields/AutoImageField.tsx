"use client";

/**
 * AutoImageField — セクションエディタ用画像フィールド
 *
 * Zod スキーマ駆動のセクション設定フォーム（AutoSectionForm）で使用される画像フィールドコンポーネント。
 * useSingleMediaPicker を使用して、メディアライブラリ・アップロード・URL入力の3タブから選択可能。
 */

import Image from "next/image";
import { IconPhotoPlus } from "@tabler/icons-react";
import { Button, Label } from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";

interface AutoImageFieldProps {
  readonly fieldId: string;
  readonly label: string;
  readonly value: string | undefined;
  readonly onSelect: (url: string) => void;
  readonly helpText?: string;
  readonly disabled?: boolean;
}

export function AutoImageField({
  fieldId,
  label,
  value,
  onSelect,
  helpText,
  disabled,
}: AutoImageFieldProps) {
  const imagePicker = useSingleMediaPicker({
    defaultUsage: "GENERAL",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        onSelect(selected.url);
      }
    },
  });

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="flex items-start gap-3">
        {value ? (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border">
            <Image
              src={value}
              alt={label}
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
            onClick={() => imagePicker.openPicker()}
            disabled={disabled}
          >
            <IconPhotoPlus className="mr-1 h-3 w-3" />
            選択
          </Button>
          {value && (
            <p className="truncate text-xs text-muted-foreground">{value}</p>
          )}
        </div>
      </div>
      {helpText && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}

      {imagePicker.mediaPickerDialog}
    </div>
  );
}
