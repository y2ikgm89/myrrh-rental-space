/**
 * 検出済 MIME type → Prisma `MediaType` enum の派生 SSoT（client-safe）。
 *
 * client-safe（`server-only` なし）— enum gateway 経由なので Server Component /
 * Client Component / Server Action のいずれからも import 可能。
 *
 * canonical 派生関数。文字列ベースの prefix 判定（`mimeType.startsWith("image/")` 等）を
 * UI / domain command / seed の各層で重複定義しない。
 *
 * Phase 4 (2026-05-24): `AUDIO` enum 値を追加。audio MIME は MediaType.AUDIO に派生する。
 * Phase 1 で `OTHER` 派生していた既存レコードはそのまま保持（再分類は行わない）。
 */

import {
  MediaType,
  type MediaType as MediaTypeValue,
} from "@/shared/lib/validations/enums/prisma-types";
import type { SupportedMediaMimeType } from "./media-magic-bytes";

/**
 * server-side で確定した MIME type を Prisma `MediaType` enum 値に派生する。
 *
 * `SupportedMediaMimeType` は server-side 検出関数の戻り値のみ受け付ける型のため、
 * 任意の string を渡せない（コンパイル時に列挙ケース漏れは型エラー）。
 */
export function deriveMediaTypeFromMime(
  mimeType: SupportedMediaMimeType,
): MediaTypeValue {
  switch (mimeType) {
    case "image/jpeg":
    case "image/png":
    case "image/webp":
    case "image/gif":
      return MediaType.IMAGE;
    case "video/mp4":
    case "video/webm":
      return MediaType.VIDEO;
    case "application/pdf":
      return MediaType.DOCUMENT;
    case "audio/mpeg":
    case "audio/wav":
      return MediaType.AUDIO;
  }
}
