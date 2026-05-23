/**
 * MediaPicker 用 `accept` ヘルパー — `MediaAcceptType` を各層に展開する純粋関数群。
 *
 * - native `<input accept>` 文字列
 * - Prisma `MediaType` フィルター値（Library tab 初期 filter 用）
 * - 各 tab / Dialog title の表示 label
 */

import type { MediaType } from "@/admin/lib/validations/media";
import type { MediaAcceptType } from "@/shared/lib/sections/types";

/**
 * `accept` → native `<input type="file" accept="...">` 文字列。
 * server-side magic-byte 検証が trust boundary のため、これは UX hint のみ。
 */
export function acceptToInputAttr(accept: MediaAcceptType): string {
  switch (accept) {
    case "image":
      return "image/*";
    case "video":
      return "video/*";
    case "audio":
      return "audio/*";
    case "file":
      return "application/pdf";
    case "any":
      return "image/*,video/*,audio/*,application/pdf";
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
    case "audio":
      return "https://.../audio.mp3";
    case "file":
      return "https://.../file.pdf";
    case "any":
      return "https://...";
  }
}
