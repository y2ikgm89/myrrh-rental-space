"use client";

/**
 * メディアアップロードダイアログ
 */

import { useState, useTransition } from "react";
import { X, Upload, File, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { uploadMedia } from "@/admin/actions/media";
import { formatBytes } from "@/admin/lib/utils";
import { Button } from "@/admin/components/ui";
import { USAGE_OPTIONS } from "./constants";
import {
  validateFile,
  inferMediaType,
  isValidMediaUsage,
  MediaUsage,
} from "@/admin/lib/validations/media";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  defaultUsage?: MediaUsage;
  onUploadSuccess?: (data: { id: string; url: string }) => void;
};

type FormState = {
  usage: MediaUsage;
  alt: string;
  title: string;
};

export function MediaUploadDialog({
  isOpen,
  onClose,
  defaultUsage = "GENERAL",
  onUploadSuccess,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormState>({
    usage: defaultUsage,
    alt: "",
    title: "",
  });

  const handleFileSelect = (selectedFile: File) => {
    const type = inferMediaType(selectedFile.type);
    const validation = validateFile(selectedFile, type);

    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setFile(selectedFile);

    if (selectedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === "string") setPreviewUrl(result);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleSubmit = () => {
    if (!file) return;

    const data = new FormData();
    data.append("file", file);
    data.append("usage", formData.usage);
    if (formData.alt) data.append("alt", formData.alt);
    if (formData.title) data.append("title", formData.title);

    startTransition(async () => {
      const result = await uploadMedia(data);

      if (result.success) {
        toast.success(result.message);
        onUploadSuccess?.(result.data);
        handleClose();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleClose = () => {
    setFile(null);
    setPreviewUrl(null);
    setFormData({ usage: defaultUsage, alt: "", title: "" });
    onClose();
  };

  const clearFile = () => {
    setFile(null);
    setPreviewUrl(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
      <div
        className="bg-background rounded-lg shadow-lg w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">メディアをアップロード</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Drop Zone */}
          {!file ? (
            <div
              className={`
                border-2 border-dashed rounded-lg p-8
                flex flex-col items-center justify-center gap-2
                cursor-pointer transition-colors
                ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary"}
              `}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                ドラッグ&ドロップ または クリックして選択
              </p>
              <p className="text-xs text-muted-foreground">
                画像: 10MB以下 / 動画: 100MB以下
              </p>
              <input
                id="file-input"
                type="file"
                accept="image/*,video/*,application/pdf"
                onChange={handleInputChange}
                className="hidden"
              />
            </div>
          ) : (
            <div className="rounded-lg border p-4">
              {/* Preview */}
              {previewUrl ? (
                <div className="mb-4 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={previewUrl}
                    alt="プレビュー"
                    className="w-full h-48 object-contain"
                  />
                </div>
              ) : (
                <div className="mb-4 rounded-lg bg-muted p-8 flex items-center justify-center">
                  <File className="h-16 w-16 text-muted-foreground" />
                </div>
              )}

              {/* File Info */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatBytes(file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Metadata Form */}
          {file && (
            <div className="space-y-3">
              {/* Usage */}
              <div>
                <label className="text-sm font-medium block mb-1">用途</label>
                <select
                  value={formData.usage}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isValidMediaUsage(value)) {
                      setFormData({ ...formData, usage: value });
                    }
                  }}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                >
                  {USAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Alt Text (for images) */}
              {file.type.startsWith("image/") && (
                <div>
                  <label className="text-sm font-medium block mb-1">
                    代替テキスト（alt）
                  </label>
                  <input
                    type="text"
                    value={formData.alt}
                    onChange={(e) =>
                      setFormData({ ...formData, alt: e.target.value })
                    }
                    placeholder="画像の説明"
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  />
                </div>
              )}

              {/* Title */}
              <div>
                <label className="text-sm font-medium block mb-1">
                  タイトル
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="管理用タイトル（任意）"
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={!file || isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            アップロード
          </Button>
        </div>
      </div>
    </div>
  );
}
