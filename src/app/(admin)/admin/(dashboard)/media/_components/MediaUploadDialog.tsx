"use client";

/**
 * メディアアップロードダイアログ
 */

import { useState, useTransition, useId } from "react";
import { IconX, IconUpload, IconFile, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { uploadMedia } from "@/admin/actions/media";
import { isMutationError } from "@/shared/lib/mutation-result";
import { formatBytes } from "@/admin/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
} from "@/admin/components/ui";
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
  const formId = useId();
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

      if (!isMutationError(result)) {
        toast.success("アップロードしました");
        onUploadSuccess?.(result);
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

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>メディアをアップロード</DialogTitle>
        </DialogHeader>

        {/* Content */}
        <div className="space-y-4">
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
              <IconUpload className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                ドラッグ&ドロップ または クリックして選択
              </p>
              <p className="text-xs text-muted-foreground">
                画像: 10MB以下 / 動画: 100MB以下
              </p>
              <label htmlFor="file-input" className="sr-only">
                ファイルを選択
              </label>
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
                  <IconFile className="h-16 w-16 text-muted-foreground" />
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
                  <IconX className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Metadata Form */}
          {file && (
            <div className="space-y-3">
              {/* Usage */}
              <div>
                <label
                  htmlFor={`${formId}-usage`}
                  className="text-sm font-medium block mb-1"
                >
                  用途
                </label>
                <select
                  id={`${formId}-usage`}
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
                  <label
                    htmlFor={`${formId}-alt`}
                    className="text-sm font-medium block mb-1"
                  >
                    代替テキスト（alt）
                  </label>
                  <input
                    id={`${formId}-alt`}
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
                <label
                  htmlFor={`${formId}-title`}
                  className="text-sm font-medium block mb-1"
                >
                  タイトル
                </label>
                <input
                  id={`${formId}-title`}
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

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={!file || isPending}>
            {isPending && (
              <IconLoader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            アップロード
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
