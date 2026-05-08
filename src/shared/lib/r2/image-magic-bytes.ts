/**
 * 画像ファイルの magic-byte 検出（server-only）
 *
 * クライアント供給の `file.type`（MIME type）はブラウザで容易に偽装できるため、
 * R2 にアップロードする前に**実バイト先頭から MIME type を確定**させる。
 *
 * Content-Type 偽装攻撃の例:
 * - HTML を `image/jpeg` として presigned URL 経由で配信 → XSS 経路化
 * - 大量の text/plain を JPEG 名で偽装 → CDN cache-poisoning
 *
 * 対応フォーマット（プロジェクトの IMAGE_VALIDATION と一致）:
 * - JPEG, PNG, WebP, GIF
 *
 * @see https://en.wikipedia.org/wiki/List_of_file_signatures
 * @see https://www.iana.org/assignments/media-types/media-types.xhtml#image
 */

import "server-only";

export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type SupportedImageMimeType =
  (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

/**
 * 先頭バイト列から画像 MIME type を確定する。
 *
 * @returns 検出した MIME type、または非対応の場合 null
 */
export function detectImageMimeFromMagicBytes(
  bytes: Uint8Array,
): SupportedImageMimeType | null {
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

  // WebP: "RIFF" + 4 bytes (file size) + "WEBP"
  if (
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
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

  return null;
}
