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
  "url",
  "icon",
  "array",
  "group",
  "portable-text-inline",
  "portable-text-block",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

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
  | "hero"
  | "content"
  | "list"
  | "functional"
  | "media";
