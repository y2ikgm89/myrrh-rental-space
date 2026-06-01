/**
 * メディアファイルのサイズ上限 SSoT（client-safe）。
 *
 * per-MIME 上限（`MEDIA_MAX_SIZE_BYTES`）を canonical とし、Prisma `MediaType`
 * 別上限（`MAX_FILE_SIZES`）はそこから派生する。client-safe（`server-only`
 * なし）— クライアント側の `file.size` 事前ガードと server-side の magic-byte
 * 検出後検証が**同一の数値**を参照する（旧実装は両者を手動同期コメントで二重定義）。
 *
 * Cloudflare R2 無料枠 (10 GB) + egress 無料を前提に、画像中心の運用で個別
 * ファイル size を抑制する。
 * - 画像: 5 MB（高解像度写真 / hero 画像）
 * - 動画: 50 MB（短尺紹介動画 / リール）
 * - 音声: 20 MB（podcast 1 セグメント / BGM）
 * - 文書: 10 MB（PDF パンフレット / 利用規約）
 */

import type { MediaType } from "@/shared/lib/validations/enums/prisma-types";
import type { SupportedMediaMimeType } from "./media-magic-bytes";

/**
 * MIME カテゴリ別の最大ファイルサイズ（bytes）。**canonical SSoT**。
 *
 * server-side magic-byte 検出（`r2/upload`）が、検出済み MIME ごとの上限検証に使う。
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

/**
 * Prisma `MediaType` 別の最大ファイルサイズ（bytes）。
 * `MEDIA_MAX_SIZE_BYTES`（per-MIME canonical）から派生する。
 *
 * クライアント側 `file.size` 事前ガード（`validateFile` / `preValidateMediaFile`）で
 * 使う。`OTHER` は magic-byte 検出対象外（SVG 等は永久非対応）で per-MIME 上限を
 * 持たないため、文書と同じ 10 MB を上限とする。
 */
export const MAX_FILE_SIZES: Record<MediaType, number> = {
  IMAGE: MEDIA_MAX_SIZE_BYTES["image/jpeg"],
  VIDEO: MEDIA_MAX_SIZE_BYTES["video/mp4"],
  AUDIO: MEDIA_MAX_SIZE_BYTES["audio/mpeg"],
  DOCUMENT: MEDIA_MAX_SIZE_BYTES["application/pdf"],
  OTHER: 10 * 1024 * 1024,
};
