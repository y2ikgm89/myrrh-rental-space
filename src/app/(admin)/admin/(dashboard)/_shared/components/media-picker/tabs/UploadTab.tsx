"use client";

/**
 * UploadTab
 *
 * アップロードタブ
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  useMediaUpload,
  type UploadResult,
} from "@/admin/hooks/use-media-upload";
import { DropZone, FilePreview } from "../components";
import { Button } from "@/admin/components/ui";
import type { MediaUsage } from "@/admin/lib/validations/media";

interface UploadTabProps {
  onUploadComplete: (media: UploadResult) => void;
  usage: MediaUsage;
  canAddMore: boolean;
}

export function UploadTab({
  onUploadComplete,
  usage,
  canAddMore,
}: UploadTabProps) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");

  const { uploadFile, isUploading, previewUrl, setPreviewFile, clearPreview } =
    useMediaUpload();

  const handleFileDrop = (droppedFile: File) => {
    setFile(droppedFile);
    setPreviewFile(droppedFile);
  };

  const handleRemoveFile = () => {
    setFile(null);
    setAlt("");
    clearPreview();
  };

  const handleUpload = async () => {
    if (!file) return;

    const result = await uploadFile(
      file,
      alt.trim() ? { alt: alt.trim() } : {},
      usage,
    );

    if (result) {
      onUploadComplete(result);
      handleRemoveFile();
    }
  };

  if (!file) {
    return (
      <div className="space-y-4">
        <DropZone onDrop={handleFileDrop} disabled={!canAddMore} />
        {!canAddMore && (
          <p className="text-center text-sm text-muted-foreground">
            選択できる画像の上限に達しました
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FilePreview
        file={file}
        previewUrl={previewUrl}
        onRemove={handleRemoveFile}
        disabled={isUploading}
      />

      <div className="space-y-2">
        <label className="text-sm font-medium">代替テキスト（任意）</label>
        <input
          type="text"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="画像の説明"
          disabled={isUploading}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      </div>

      <Button
        type="button"
        onClick={handleUpload}
        disabled={isUploading || !canAddMore}
        className="w-full"
      >
        {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        アップロードして追加
      </Button>
    </div>
  );
}
