"use client";

/**
 * MediaPreview — accept カテゴリ別のプレビュー描画 primitive
 *
 * URL から拡張子 / MIME 推定でプレビュー variant を切替:
 * - image: `<img>` (透過は `bg-checker` で可視化)
 * - video: HTML5 `<video controls>` (R2 self-host) / `<iframe>` (YouTube/Vimeo)
 * - audio: HTML5 `<audio controls>` + `IconMusic` 装飾
 * - document (pdf): `IconFileText` icon + ファイル名
 *
 * `url` が空文字列または非対応形式の場合は何も描画しない。
 */

import {
  IconFileText,
  IconMusic,
  IconPhoto,
  IconVideo,
} from "@tabler/icons-react";
import type { MediaAcceptType } from "@/shared/lib/sections/types";
import { cn } from "@/shared/lib/cn";

const YOUTUBE_PATTERN =
  /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/;
const VIMEO_PATTERN = /vimeo\.com\/(\d+)/;

interface MediaPreviewProps {
  readonly url: string;
  readonly accept: MediaAcceptType;
  readonly alt?: string;
  readonly className?: string;
}

function detectVideoEmbed(url: string): string | null {
  const yt = YOUTUBE_PATTERN.exec(url);
  if (yt && yt[1]) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = VIMEO_PATTERN.exec(url);
  if (vm && vm[1]) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

export function MediaPreview({
  url,
  accept,
  alt,
  className,
}: MediaPreviewProps) {
  if (url.length === 0) return null;

  if (accept === "image" || (accept === "any" && looksLikeImage(url))) {
    return (
      <img
        src={url}
        alt={alt ?? ""}
        className={cn("h-full w-full object-cover bg-checker", className)}
      />
    );
  }

  if (accept === "video" || (accept === "any" && looksLikeVideo(url))) {
    const embed = detectVideoEmbed(url);
    if (embed) {
      return (
        <iframe
          src={embed}
          title={alt ?? "動画プレビュー"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className={cn("h-full w-full", className)}
        />
      );
    }
    return (
      <video
        src={url}
        controls
        className={cn("h-full w-full bg-foreground", className)}
      />
    );
  }

  if (accept === "audio" || (accept === "any" && looksLikeAudio(url))) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2 bg-muted p-4",
          className,
        )}
      >
        <IconMusic
          className="h-10 w-10 text-muted-foreground"
          aria-hidden="true"
        />
        {}
        <audio src={url} controls className="w-full" />
      </div>
    );
  }

  if (accept === "file" || (accept === "any" && looksLikeDocument(url))) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2 bg-muted p-4 text-center",
          className,
        )}
      >
        <IconFileText
          className="h-10 w-10 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="break-all px-2 text-xs text-muted-foreground">
          {decodeFilename(url)}
        </span>
      </div>
    );
  }

  // any で形式判別できない場合は generic icon
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-muted",
        className,
      )}
    >
      <IconPhoto
        className="h-10 w-10 text-muted-foreground"
        aria-hidden="true"
      />
      <IconVideo className="sr-only" aria-hidden="true" />
    </div>
  );
}

function looksLikeImage(url: string): boolean {
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
}

function looksLikeVideo(url: string): boolean {
  return (
    /\.(mp4|webm)(\?|$)/i.test(url) ||
    YOUTUBE_PATTERN.test(url) ||
    VIMEO_PATTERN.test(url)
  );
}

function looksLikeAudio(url: string): boolean {
  return /\.(mp3|wav)(\?|$)/i.test(url);
}

function looksLikeDocument(url: string): boolean {
  return /\.pdf(\?|$)/i.test(url);
}

function decodeFilename(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : url;
  } catch {
    return url;
  }
}
