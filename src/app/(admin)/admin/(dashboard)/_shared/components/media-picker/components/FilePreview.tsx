"use client";

/**
 * FilePreview
 *
 * アップロードファイルのプレビュー
 */

import {
  IconFile,
  IconFileText,
  IconMovie,
  IconMusic,
  IconX,
} from "@tabler/icons-react";
import { inferMediaType } from "@/admin/lib/validations/media";
import { formatBytes } from "../../../lib/utils";

interface FilePreviewProps {
  file: File;
  previewUrl: string | null;
  onRemove: () => void;
  disabled?: boolean;
}

function FileTypeIcon({ file }: { file: File }) {
  const mediaType = inferMediaType(file.type);
  switch (mediaType) {
    case "VIDEO":
      return <IconMovie className="h-12 w-12 text-muted-foreground" />;
    case "AUDIO":
      return <IconMusic className="h-12 w-12 text-muted-foreground" />;
    case "DOCUMENT":
      return <IconFileText className="h-12 w-12 text-muted-foreground" />;
    default:
      return <IconFile className="h-12 w-12 text-muted-foreground" />;
  }
}

export function FilePreview({
  file,
  previewUrl,
  onRemove,
  disabled = false,
}: FilePreviewProps) {
  return (
    <div className="space-y-4">
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-checker">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="プレビュー"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <FileTypeIcon file={file} />
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{file.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatBytes(file.size)}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="rounded p-1 hover:bg-muted disabled:opacity-50"
          aria-label="ファイルを削除"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
