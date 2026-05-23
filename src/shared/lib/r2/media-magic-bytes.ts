/**
 * メディアファイルの magic-byte 検出（server-only）
 *
 * クライアント供給の `file.type`（MIME type）はブラウザで容易に偽装できるため、
 * R2 にアップロードする前に**実バイト先頭から MIME type を確定**させる。
 *
 * Content-Type 偽装攻撃の例:
 * - HTML を `image/jpeg` として presigned URL 経由で配信 → XSS 経路化
 * - 大量の text/plain を JPEG 名で偽装 → CDN cache-poisoning
 * - mp4 偽装の `.exe` / `.html` を `video/mp4` で送信 → ブラウザの拡張子推測経路で誤実行
 *
 * 対応フォーマット（4 系統 + MediaType 4 値の派生に直接対応）:
 * - 画像: JPEG / PNG / WebP / GIF
 * - 動画: MP4（ftyp box） / WebM（EBML）
 * - 音声: MP3（ID3 / frame sync） / WAV（RIFF + WAVE）
 * - 文書: PDF
 *
 * SVG は magic byte を持たない XML テキストで XSS リスクが高いため対象外
 * （業界標準: Sanity Studio / WordPress Media Library で sanitize 必須扱い）。
 *
 * @see https://en.wikipedia.org/wiki/List_of_file_signatures
 * @see https://www.iana.org/assignments/media-types/media-types.xhtml
 */

import "server-only";

// =============================================================================
// Supported MIME types
// =============================================================================

export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const SUPPORTED_VIDEO_MIME_TYPES = ["video/mp4", "video/webm"] as const;

export const SUPPORTED_AUDIO_MIME_TYPES = ["audio/mpeg", "audio/wav"] as const;

export const SUPPORTED_DOCUMENT_MIME_TYPES = ["application/pdf"] as const;

export const SUPPORTED_MEDIA_MIME_TYPES = [
  ...SUPPORTED_IMAGE_MIME_TYPES,
  ...SUPPORTED_VIDEO_MIME_TYPES,
  ...SUPPORTED_AUDIO_MIME_TYPES,
  ...SUPPORTED_DOCUMENT_MIME_TYPES,
] as const;

export type SupportedImageMimeType =
  (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];
export type SupportedVideoMimeType =
  (typeof SUPPORTED_VIDEO_MIME_TYPES)[number];
export type SupportedAudioMimeType =
  (typeof SUPPORTED_AUDIO_MIME_TYPES)[number];
export type SupportedDocumentMimeType =
  (typeof SUPPORTED_DOCUMENT_MIME_TYPES)[number];
export type SupportedMediaMimeType =
  (typeof SUPPORTED_MEDIA_MIME_TYPES)[number];

/**
 * 検出済み MIME type に対応する公式拡張子（小文字、ドットなし）。
 *
 * R2 object key の拡張子は **server-side で検出した MIME** から派生させる
 * （クライアント供給の `file.name` は path traversal / 任意拡張子の経路）。
 *
 * @see https://www.iana.org/assignments/media-types/media-types.xhtml
 */
export const MEDIA_MIME_EXTENSIONS: Record<SupportedMediaMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "application/pdf": "pdf",
};

// =============================================================================
// Per-MIME size constraints
// =============================================================================

/**
 * MIME カテゴリ別の最大ファイルサイズ（bytes）。
 *
 * Cloudflare R2 無料枠 (10 GB) + egress 無料を前提に、画像中心の運用で
 * 個別ファイル size を抑制する。動画 / 音声 / 文書は self-host 上限値。
 * - 画像: 5 MB（高解像度写真 / hero 画像）
 * - 動画: 50 MB（短尺紹介動画 / リール）
 * - 音声: 20 MB（podcast 1 セグメント / BGM）
 * - 文書: 10 MB（PDF パンフレット / 利用規約）
 */
export const MEDIA_MAX_SIZE_BYTES: Record<SupportedMediaMimeType, number> = {
  "image/jpeg": 5 * 1024 * 1024,
  "image/png": 5 * 1024 * 1024,
  "image/webp": 5 * 1024 * 1024,
  "image/gif": 5 * 1024 * 1024,
  "video/mp4": 50 * 1024 * 1024,
  "video/webm": 50 * 1024 * 1024,
  "audio/mpeg": 20 * 1024 * 1024,
  "audio/wav": 20 * 1024 * 1024,
  "application/pdf": 10 * 1024 * 1024,
};

// =============================================================================
// Detection
// =============================================================================

/**
 * 先頭バイト列から画像 / 動画 / 音声 / 文書の MIME type を確定する。
 *
 * 走査順は最も signature が安定している image を先頭にし、続いて container 系
 * （MP4 ftyp box / WebM EBML / RIFF）、最後に PDF / MP3 の順で判定する。
 *
 * @returns 検出した MIME type、または非対応の場合 null
 */
export function detectMediaMimeFromMagicBytes(
  bytes: Uint8Array,
): SupportedMediaMimeType | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // RIFF container: "RIFF" + 4 bytes (file size) + form type (WEBP / WAVE)
  if (
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 // F
  ) {
    // WebP: form type "WEBP"
    if (
      bytes[8] === 0x57 && // W
      bytes[9] === 0x45 && // E
      bytes[10] === 0x42 && // B
      bytes[11] === 0x50 // P
    ) {
      return "image/webp";
    }

    // WAV: form type "WAVE"
    if (
      bytes[8] === 0x57 && // W
      bytes[9] === 0x41 && // A
      bytes[10] === 0x56 && // V
      bytes[11] === 0x45 // E
    ) {
      return "audio/wav";
    }
  }

  // GIF: "GIF87a" or "GIF89a"
  if (
    bytes[0] === 0x47 && // G
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x38 && // 8
    (bytes[4] === 0x37 || bytes[4] === 0x39) && // 7 or 9
    bytes[5] === 0x61 // a
  ) {
    return "image/gif";
  }

  // MP4: ISO Base Media File Format box header
  //   offset 4-7: "ftyp" (66 74 79 70)
  //   offset 8-11: major brand (e.g. "isom" / "mp42" / "iso5" / "avc1")
  if (
    bytes[4] === 0x66 && // f
    bytes[5] === 0x74 && // t
    bytes[6] === 0x79 && // y
    bytes[7] === 0x70 // p
  ) {
    return "video/mp4";
  }

  // WebM / Matroska: EBML header signature 1A 45 DF A3
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }

  // PDF: "%PDF-"
  if (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  ) {
    return "application/pdf";
  }

  // MP3: ID3 tag "ID3" (49 44 33) or MPEG frame sync (FF Ex / FF Fx)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return "audio/mpeg";
  }
  if (
    bytes[0] === 0xff &&
    bytes[1] !== undefined &&
    (bytes[1] & 0xe0) === 0xe0
  ) {
    return "audio/mpeg";
  }

  return null;
}

// =============================================================================
// Backward-compatible image-only helper (removed)
// =============================================================================
//
// `detectImageMimeFromMagicBytes` / `SUPPORTED_IMAGE_MIME_TYPES` (image only) /
// `IMAGE_MIME_EXTENSIONS` は破壊的変更で `detectMediaMimeFromMagicBytes` /
// `SUPPORTED_MEDIA_MIME_TYPES` / `MEDIA_MIME_EXTENSIONS` に統合した。
// 旧 API への再 export shim は意図的に提供しない（後方互換ハック禁止規律）。
