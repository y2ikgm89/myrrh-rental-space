"use client";

/**
 * UrlTab
 *
 * URL入力タブ
 */

import { useState } from "react";
import { IconLink, IconAlertCircle, IconPhoto } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import type { MediaAcceptType } from "@/shared/lib/sections/types";
import { acceptToLabel, acceptToUrlPlaceholder } from "../accept-helpers";

interface UrlTabProps {
  onAdd: (url: string, alt?: string) => void;
  canAddMore: boolean;
  accept?: MediaAcceptType;
}

export function UrlTab({ onAdd, canAddMore, accept = "image" }: UrlTabProps) {
  const acceptLabel = acceptToLabel(accept);
  const urlPlaceholder = acceptToUrlPlaceholder(accept);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const validateUrl = (value: string): boolean => {
    if (!value.trim()) {
      setError("URLを入力してください");
      setPreviewUrl(null);
      return false;
    }

    try {
      new URL(value);
      setError(null);
      setPreviewUrl(value);
      return true;
    } catch {
      setError("有効なURLを入力してください");
      setPreviewUrl(null);
      return false;
    }
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (value.trim()) {
      validateUrl(value);
    } else {
      setError(null);
      setPreviewUrl(null);
    }
  };

  const handleAdd = () => {
    if (!validateUrl(url)) return;
    if (!canAddMore) return;

    onAdd(url.trim(), alt.trim() || undefined);
    setUrl("");
    setAlt("");
    setPreviewUrl(null);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">{acceptLabel}URL</label>
        <div className="relative">
          <IconLink className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="url"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={urlPlaceholder}
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {error && (
          <p className="flex items-center gap-1 text-sm text-destructive">
            <IconAlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">代替テキスト（任意）</label>
        <input
          type="text"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="画像の説明"
          className="h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {previewUrl && (
        <div className="space-y-2">
          <label className="text-sm font-medium">プレビュー</label>
          {/* bg-checker: 透過 PNG / SVG の透過部分を市松模様で可視化 */}
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-checker">
            <img
              src={previewUrl}
              alt={alt || "プレビュー"}
              className="max-h-full max-w-full object-contain"
              onError={() => {
                setError("画像を読み込めませんでした");
                setPreviewUrl(null);
              }}
            />
          </div>
        </div>
      )}

      {!previewUrl && url && !error && (
        <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed bg-muted/30">
          <div className="text-center text-muted-foreground">
            <IconPhoto className="mx-auto h-8 w-8" />
            <p className="mt-2 text-sm">
              URLを入力するとプレビューが表示されます
            </p>
          </div>
        </div>
      )}

      <Button
        type="button"
        onClick={handleAdd}
        disabled={!url.trim() || !!error || !canAddMore}
        className="w-full"
      >
        追加
      </Button>

      {!canAddMore && (
        <p className="text-center text-sm text-muted-foreground">
          選択できる画像の上限に達しました
        </p>
      )}
    </div>
  );
}
