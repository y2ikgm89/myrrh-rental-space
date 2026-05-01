"use client";

/**
 * AutoImageField — セクションエディタ用画像フィールド（Phase 3）
 *
 * Zod スキーマ駆動のセクション設定フォーム（AutoSectionForm）で使用される画像フィールドコンポーネント。
 *
 * 機能:
 * - 160×120 の大型サムネイル（aspect-[4/3]）
 * - Drag & Drop で直接アップロード（useMediaUpload）
 * - 画像クリック / MediaPicker で既存画像から選択
 * - hover overlay で「変更 / 削除」操作
 * - アップロード中は aria-busy + 視覚フィードバック
 */

import { useState } from "react";
import Image from "next/image";
import { IconPhotoPlus, IconTrash, IconPhoto } from "@tabler/icons-react";
import { Button, Label } from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import { useMediaUpload } from "@/admin/hooks/use-media-upload";
import { cn } from "@/shared/lib/cn";

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
  const [isDragOver, setIsDragOver] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  const imagePicker = useSingleMediaPicker({
    defaultUsage: "GENERAL",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        setImageLoadError(false);
        onSelect(selected.url);
      }
    },
  });

  const { uploadFile, isUploading } = useMediaUpload();

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled || isUploading) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled || isUploading) return;

    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const result = await uploadFile(file, {}, "GENERAL");
    if (result) {
      setImageLoadError(false);
      onSelect(result.url);
    }
  };

  const handleRemove = () => {
    setImageLoadError(false);
    onSelect("");
  };

  const hasImage = Boolean(value) && !imageLoadError;
  const isBusy = isUploading;

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <div
        className={cn(
          "group relative aspect-[4/3] w-40 overflow-hidden rounded-lg border border-dashed transition-colors",
          isDragOver
            ? "border-primary bg-primary/5"
            : hasImage
              ? // bg-checker: 透過 PNG / SVG の透過部分を市松模様で可視化
                "border-border bg-checker"
              : "border-border bg-muted hover:border-primary/50",
          (disabled || isBusy) && "opacity-60",
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-busy={isBusy}
      >
        {hasImage ? (
          <>
            <Image
              src={value ?? ""}
              alt={label}
              fill
              sizes="160px"
              className="object-cover"
              onError={() => setImageLoadError(true)}
            />
            {/* Hover overlay: 変更 / 削除 */}
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-overlay opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => imagePicker.openPicker()}
                disabled={disabled || isBusy}
                aria-label="画像を変更"
              >
                <IconPhoto className="mr-1 h-3 w-3" />
                変更
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleRemove}
                disabled={disabled || isBusy}
                aria-label="画像を削除"
              >
                <IconTrash className="h-3 w-3" />
              </Button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => imagePicker.openPicker()}
            disabled={disabled || isBusy}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed"
            id={fieldId}
            aria-describedby={helpText ? `${fieldId}-help` : undefined}
          >
            <IconPhotoPlus className="h-8 w-8" />
            <span className="px-2 text-center text-xs">
              {isUploading
                ? "アップロード中..."
                : isDragOver
                  ? "ここにドロップ"
                  : "画像を選択 / ドロップ"}
            </span>
          </button>
        )}
      </div>
      {helpText && (
        <p id={`${fieldId}-help`} className="text-xs text-muted-foreground">
          {helpText}
        </p>
      )}

      {imagePicker.mediaPickerDialog}
    </div>
  );
}
