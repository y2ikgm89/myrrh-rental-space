/**
 * MediaPicker 用 `accept` ヘルパー — `MediaAcceptType` を各層に展開する純粋関数群。
 *
 * - native `<input accept>` 文字列
 * - Prisma `MediaType` フィルター値（Library tab 初期 filter 用）
 * - 各 tab / Dialog title の表示 label
 */

import {
  ALLOWED_MIME_TYPES,
  type MediaType,
} from "@/admin/lib/validations/media";
import type { MediaAcceptType } from "@/shared/lib/sections/types";
import { detectVideoProvider } from "@/shared/lib/video/url-detect";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"] as const;

const VIDEO_EXTENSIONS = [".mp4", ".webm"] as const;

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".webm"] as const;

function joinMimeTypes(...groups: readonly string[][]): string {
  return groups.flat().join(",");
}

function getUrlExtension(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const dot = pathname.lastIndexOf(".");
    if (dot === -1) return null;
    return pathname.slice(dot);
  } catch {
    return null;
  }
}

function extensionMatches(url: string, extensions: readonly string[]): boolean {
  const ext = getUrlExtension(url);
  return ext !== null && extensions.includes(ext);
}

/**
 * URL が画像らしいか（拡張子ベースの UX hint）。
 */
export function urlLooksLikeImage(url: string): boolean {
  return extensionMatches(url, IMAGE_EXTENSIONS);
}

/**
 * `accept` カテゴリに URL が合致するか（http/https のみ。動画は YouTube/Vimeo も許容）。
 */
export function urlMatchesAccept(
  url: string,
  accept: MediaAcceptType,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const { provider } = detectVideoProvider(url);
  const isEmbedVideo = provider !== undefined;

  switch (accept) {
    case "image":
      return urlLooksLikeImage(url);
    case "video":
      return isEmbedVideo || extensionMatches(url, VIDEO_EXTENSIONS);
    case "image-or-video":
      return (
        urlLooksLikeImage(url) ||
        isEmbedVideo ||
        extensionMatches(url, VIDEO_EXTENSIONS)
      );
    case "audio":
      return extensionMatches(url, AUDIO_EXTENSIONS);
    case "file":
      return extensionMatches(url, [".pdf"]);
    case "any":
      return true;
    default: {
      const _exhaustive: never = accept;
      return _exhaustive;
    }
  }
}

/**
 * `accept` → native `<input type="file" accept="...">` 文字列。
 * server-side magic-byte 検証が trust boundary のため、これは UX hint のみ。
 */
export function acceptToInputAttr(accept: MediaAcceptType): string {
  switch (accept) {
    case "image":
      return joinMimeTypes(ALLOWED_MIME_TYPES.IMAGE);
    case "video":
      return joinMimeTypes(ALLOWED_MIME_TYPES.VIDEO);
    case "image-or-video":
      return joinMimeTypes(ALLOWED_MIME_TYPES.IMAGE, ALLOWED_MIME_TYPES.VIDEO);
    case "audio":
      return joinMimeTypes(ALLOWED_MIME_TYPES.AUDIO);
    case "file":
      return joinMimeTypes(ALLOWED_MIME_TYPES.DOCUMENT);
    case "any":
      return joinMimeTypes(
        ALLOWED_MIME_TYPES.IMAGE,
        ALLOWED_MIME_TYPES.VIDEO,
        ALLOWED_MIME_TYPES.AUDIO,
        ALLOWED_MIME_TYPES.DOCUMENT,
      );
  }
}

/**
 * `accept` → MediaPicker Library tab で初期表示する `MediaType` フィルター。
 * - `image/video/audio` は対応 MediaType に narrow
 * - `file` は MediaType.DOCUMENT に narrow
 * - `any` は filter なし (`undefined`)
 */
export function acceptToInitialMediaType(
  accept: MediaAcceptType,
): MediaType | undefined {
  switch (accept) {
    case "image":
      return "IMAGE";
    case "video":
      return "VIDEO";
    case "image-or-video":
      return "IMAGE";
    case "audio":
      return "AUDIO";
    case "file":
      return "DOCUMENT";
    case "any":
      return undefined;
  }
}

/** 日本語短縮ラベル（Dialog title / プレースホルダー hint で使用） */
export function acceptToLabel(accept: MediaAcceptType): string {
  switch (accept) {
    case "image":
      return "画像";
    case "video":
      return "動画";
    case "image-or-video":
      return "画像 / 動画";
    case "audio":
      return "音声";
    case "file":
      return "ファイル";
    case "any":
      return "メディア";
  }
}

/**
 * URL タブ placeholder。動画は YouTube/Vimeo 埋込 URL も許容する hint を出す。
 */
export function acceptToUrlPlaceholder(accept: MediaAcceptType): string {
  switch (accept) {
    case "image":
      return "https://.../image.jpg";
    case "video":
      return "https://www.youtube.com/watch?v=... または https://.../video.mp4";
    case "image-or-video":
      return "https://.../image.jpg または https://www.youtube.com/watch?v=...";
    case "audio":
      return "https://.../audio.mp3";
    case "file":
      return "https://.../file.pdf";
    case "any":
      return "https://...";
  }
}
