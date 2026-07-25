"use client";

/**
 * UrlTab
 *
 * URL 入力タブ。shared Input / Label SSoT に一本化しており、
 * `<Label htmlFor>` で入力欄に紐付けている。
 */

import { useId, useState } from "react";
import {
  IconAlertCircle,
  IconExternalLink,
  IconLink,
} from "@tabler/icons-react";
import { Button, Input, Label } from "@/admin/components/ui";
import type { MediaAcceptType } from "@/shared/lib/sections/types";
import {
  acceptToLabel,
  acceptToUrlPlaceholder,
  urlLooksLikeImage,
  urlMatchesAccept,
} from "../accept-helpers";

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
  const [showLinkPreview, setShowLinkPreview] = useState(false);

  const validateUrl = (value: string): boolean => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("URLを入力してください");
      setPreviewUrl(null);
      setShowLinkPreview(false);
      return false;
    }

    if (!urlMatchesAccept(trimmed, accept)) {
      setError(`有効な${acceptLabel}URLを入力してください（http/https）`);
      setPreviewUrl(null);
      setShowLinkPreview(false);
      return false;
    }

    setError(null);
    if (urlLooksLikeImage(trimmed)) {
      setPreviewUrl(trimmed);
      setShowLinkPreview(false);
    } else {
      setPreviewUrl(null);
      setShowLinkPreview(true);
    }
    return true;
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (value.trim()) {
      validateUrl(value);
    } else {
      setError(null);
      setPreviewUrl(null);
      setShowLinkPreview(false);
    }
  };

  const handleAdd = () => {
    if (!validateUrl(url)) return;
    if (!canAddMore) return;

    onAdd(url.trim(), alt.trim() || undefined);
    setUrl("");
    setAlt("");
    setPreviewUrl(null);
    setShowLinkPreview(false);
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
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-checker">
            <img
              src={previewUrl}
              alt={alt || "プレビュー"}
              className="max-h-full max-w-full object-contain"
              onError={() => {
                setError("画像を読み込めませんでした");
                setPreviewUrl(null);
                setShowLinkPreview(true);
              }}
            />
          </div>
        </div>
      )}

      {showLinkPreview && url && !error && (
        <div className="space-y-2">
          <p className="text-sm font-medium">プレビュー</p>
          <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed bg-muted/30 p-4">
            <div className="text-center text-muted-foreground">
              <IconLink className="mx-auto h-8 w-8" aria-hidden="true" />
              <p className="mt-2 break-all text-sm">{url.trim()}</p>
              <a
                href={url.trim()}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <IconExternalLink className="h-3 w-3" aria-hidden="true" />
                リンクを開く
              </a>
            </div>
          </div>
        </div>
      )}

      {!previewUrl && !showLinkPreview && url && !error && (
        <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed bg-muted/30">
          <div className="text-center text-muted-foreground">
            <IconLink className="mx-auto h-8 w-8" aria-hidden="true" />
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
