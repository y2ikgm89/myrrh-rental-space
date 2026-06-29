// src/shared/lib/sections/types.ts

import type { z } from "zod";

// ────────────────────────────────────────────
// Field Type (FieldMeta は field-registry.ts に集約)
// ────────────────────────────────────────────

export const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "boolean",
  "select",
  "color",
  "image",
  "media",
  "url",
  "icon",
  "array",
  "group",
  "portable-text-inline",
  "portable-text-block",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/**
 * `field.media({ accept })` の許容カテゴリ。
 * server-side magic-byte 検出 + MediaPicker dialog filter / native `<input accept>` に伝播。
 *
 * - `image`: 画像 (JPEG/PNG/WebP/GIF)
 * - `video`: 動画 (MP4/WebM + YouTube/Vimeo URL)
 * - `image-or-video`: 画像 OR 動画 (Hero 系の単一メディアフィールド用、WordPress Cover Block / Sanity Studio 業界標準パターン)
 * - `audio`: 音声 (MP3/WAV)
 * - `file`: 文書 (PDF) — 「file」は業界標準の呼称（Lexical FileNode と整合）
 * - `any`: 画像/動画/音声/文書すべて（汎用メディアライブラリ用）
 */
export const MEDIA_ACCEPT_TYPES = [
  "image",
  "video",
  "image-or-video",
  "audio",
  "file",
  "any",
] as const;

export type MediaAcceptType = (typeof MEDIA_ACCEPT_TYPES)[number];

// ────────────────────────────────────────────
// Section Definition (one per section type)
// ────────────────────────────────────────────

/** セクション定義（1タイプにつき1つ） */
export interface SectionDefinition<TConfig = unknown> {
  readonly type: string;
  readonly configSchema: z.ZodType<TConfig>;
  readonly metadata: SectionMetadata;
}

export interface SectionMetadata {
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly category: SectionCategory;
}

export type SectionCategory =
  "hero" | "content" | "list" | "functional" | "media";
