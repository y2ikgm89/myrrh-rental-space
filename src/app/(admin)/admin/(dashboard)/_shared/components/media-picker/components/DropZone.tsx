"use client";

/**
 * DropZone
 *
 * ファイルドラッグ&ドロップエリア。native `<label>` + `<input type="file">` の
 * associate 構造で、キーボード（Tab で input にフォーカス → Enter / Space で
 * ネイティブファイルダイアログ）とスクリーンリーダーの両方に対応する。
 * `sr-only` (display:none ではない) が focusable のまま視覚的に隠す鍵。
 */

import { useId, useState } from "react";
import { IconUpload } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";

interface DropZoneProps {
  onDrop: (file: File) => void;
  accept?: string;
  disabled?: boolean;
}

export function DropZone({
  onDrop,
  accept = "image/*",
  disabled = false,
}: DropZoneProps) {
  const inputId = useId();
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) {
      onDrop(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onDrop(file);
      e.target.value = "";
    }
  };

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors",
        "focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        isDragOver
          ? "border-primary bg-primary/5"
          : "hover:border-primary hover:bg-primary/5",
        disabled && "cursor-not-allowed opacity-50",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <IconUpload
        className="mb-2 h-12 w-12 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="text-muted-foreground">
        ドラッグ&ドロップ または クリックして選択
      </p>
      <input
        id={inputId}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="sr-only"
        disabled={disabled}
      />
    </label>
  );
}
