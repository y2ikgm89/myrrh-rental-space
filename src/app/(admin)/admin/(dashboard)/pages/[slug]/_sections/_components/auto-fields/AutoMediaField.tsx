"use client";

/**
 * AutoMediaField — `field.media({ accept })` 用一般化メディアフィールド
 *
 * `AutoImageField` の一般化版。`accept` カテゴリ別に:
 * - プレビュー描画 (`MediaPreview`: image / video / audio / pdf)
 * - 空状態の icon / hint テキスト
 * - MediaPicker dialog の filter / accept 属性
 * を切り替える。
 *
 * Drag & Drop アップロードは accept カテゴリに沿った MIME のみ受け付ける
 * (server-side magic-byte 検証は `r2/upload` が trust boundary、UI hint のみ)。
 */

import { createElement, useState } from "react";
import { toast } from "sonner";
import {
  IconFileText,
  IconMusic,
  IconPhotoPlus,
  IconTrash,
  IconUpload,
  IconVideo,
} from "@tabler/icons-react";
import { Button, Label } from "@/admin/components/ui";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import { useMediaUpload } from "@/admin/hooks/use-media-upload";
import { MediaPreview } from "@/admin/components/media-picker/MediaPreview";
import { acceptToLabel } from "@/admin/components/media-picker/accept-helpers";
import {
  validateFile,
  inferMediaType,
  type MediaType,
} from "@/admin/lib/validations/media";
import { cn } from "@/shared/lib/cn";
import type { MediaAcceptType } from "@/shared/lib/sections/types";

function acceptedMediaTypes(accept: MediaAcceptType): MediaType[] {
  switch (accept) {
    case "image":
      return ["IMAGE"];
    case "video":
      return ["VIDEO"];
    case "image-or-video":
      return ["IMAGE", "VIDEO"];
    case "audio":
      return ["AUDIO"];
    case "file":
      return ["DOCUMENT"];
    case "any":
      return ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"];
  }
}

function fileMatchesAccept(file: File, accept: MediaAcceptType): boolean {
  const mediaType = inferMediaType(file.type);
  return acceptedMediaTypes(accept).includes(mediaType);
}

interface AutoMediaFieldProps {
  readonly fieldId: string;
  readonly label: string;
  readonly accept: MediaAcceptType;
  readonly value: string | undefined;
  readonly onSelect: (url: string) => void;
  readonly helpText?: string;
  readonly disabled?: boolean;
}

function emptyStateIcon(accept: MediaAcceptType) {
  switch (accept) {
    case "video":
      return IconVideo;
    case "audio":
      return IconMusic;
    case "file":
      return IconFileText;
    case "image":
    case "any":
    default:
      return IconPhotoPlus;
  }
}

export function AutoMediaField({
  fieldId,
  label,
  accept,
  value,
  onSelect,
  helpText,
  disabled,
}: AutoMediaFieldProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const picker = useSingleMediaPicker({
    defaultUsage: "GENERAL",
    accept,
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        setPreviewError(false);
        onSelect(selected.url);
      }
    },
  });

  const { uploadFile, isUploading } = useMediaUpload();

  const acceptLabel = acceptToLabel(accept);
  const emptyIcon = emptyStateIcon(accept);

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

    if (!fileMatchesAccept(file, accept)) {
      toast.error(`対応していないファイル形式です（${acceptLabel}のみ）`);
      return;
    }

    const mediaType = inferMediaType(file.type);
    const validation = validateFile(file, mediaType);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    const result = await uploadFile(file, {}, "GENERAL");
    if (result) {
      setPreviewError(false);
      onSelect(result.url);
    }
  };

  const handleRemove = () => {
    setPreviewError(false);
    onSelect("");
  };

  const hasMedia = value !== undefined && value.length > 0 && !previewError;
  const isBusy = isUploading;

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <div
        className={cn(
          "relative aspect-[4/3] w-48 overflow-hidden rounded-lg border border-dashed transition-colors",
          isDragOver
            ? "border-primary bg-primary/5"
            : hasMedia
              ? "border-border"
              : "border-border bg-muted hover:border-primary/50",
          (disabled || isBusy) && "opacity-60",
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => void handleDrop(e)}
        aria-busy={isBusy}
      >
        {hasMedia && value !== undefined ? (
          <MediaPreview url={value} accept={accept} alt={label} />
        ) : (
          <button
            type="button"
            onClick={() => picker.openPicker()}
            disabled={disabled || isBusy}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed"
            id={fieldId}
            aria-describedby={helpText ? `${fieldId}-help` : undefined}
          >
            {createElement(emptyIcon, {
              className: "h-8 w-8",
              "aria-hidden": "true",
            })}
            <span className="px-2 text-center text-xs">
              {isUploading
                ? "アップロード中..."
                : isDragOver
                  ? "ここにドロップ"
                  : `${acceptLabel}を選択 / ドロップ`}
            </span>
          </button>
        )}
      </div>
      {hasMedia && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => picker.openPicker()}
            disabled={disabled || isBusy}
          >
            <IconUpload className="mr-1 h-3 w-3" />
            変更
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleRemove}
            disabled={disabled || isBusy}
            aria-label={`${acceptLabel}を削除`}
          >
            <IconTrash className="h-3 w-3" />
          </Button>
        </div>
      )}
      {helpText && (
        <p id={`${fieldId}-help`} className="text-xs text-muted-foreground">
          {helpText}
        </p>
      )}

      {picker.mediaPickerDialog}
    </div>
  );
}
