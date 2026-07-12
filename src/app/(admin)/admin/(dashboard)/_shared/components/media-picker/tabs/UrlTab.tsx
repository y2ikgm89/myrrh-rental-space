"use client";

/**
 * UrlTab
 *
 * URL 入力タブ。shared Input / Label SSoT に一本化しており、
 * `<Label htmlFor>` で入力欄に紐付けている。
 */

import { useId, useState } from "react";
import { IconAlertCircle, IconPhoto } from "@tabler/icons-react";
import { Button, Input, Label } from "@/admin/components/ui";
import type { MediaAcceptType } from "@/shared/lib/sections/types";
import { acceptToLabel, acceptToUrlPlaceholder } from "../accept-helpers";

interface UrlTabProps {
  onAdd: (url: string, alt?: string) => void;
  canAddMore: boolean;
  accept: MediaAcceptType;
}

export function UrlTab({ onAdd, canAddMore, accept }: UrlTabProps) {
  const acceptLabel = acceptToLabel(accept);
  const urlPlaceholder = acceptToUrlPlaceholder(accept);
  const urlInputId = useId();
  const altInputId = useId();
  const errorId = useId();
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
        <Label htmlFor={urlInputId}>{acceptLabel}URL</Label>
        <Input
          id={urlInputId}
          type="url"
          leadingIcon="IconLink"
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={urlPlaceholder}
          aria-invalid={error !== null || undefined}
          aria-describedby={error !== null ? errorId : undefined}
        />
        {error && (
          <p
            id={errorId}
            className="flex items-center gap-1 text-sm text-destructive"
          >
            <IconAlertCircle className="h-3 w-3" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={altInputId}>代替テキスト（任意）</Label>
        <Input
          id={altInputId}
          type="text"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder={`${acceptLabel}の説明`}
        />
      </div>

      {previewUrl && (
        <div className="space-y-2">
          <p className="text-sm font-medium">プレビュー</p>
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
          選択できる{acceptLabel}の上限に達しました
        </p>
      )}
    </div>
  );
}
