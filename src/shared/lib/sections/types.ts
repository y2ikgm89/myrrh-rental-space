// src/shared/lib/sections/types.ts

import type { z } from "zod";

// ────────────────────────────────────────────
// Field Metadata (embedded in Zod .describe())
// ────────────────────────────────────────────

/** フィールドメタデータ — Zod .describe() に JSON エンコードして埋め込む */
export interface FieldMeta {
  readonly fieldType: FieldType;
  readonly label: string;
  readonly placeholder?: string;
  readonly suffix?: string;
  readonly helpText?: string;
}

export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "boolean"
  | "select"
  | "color"
  | "image"
  | "url"
  | "icon"
  | "array"
  | "group";

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

// ────────────────────────────────────────────
// Public Section Component Props
// ────────────────────────────────────────────

/** 公開ページセクションコンポーネントの props */
export interface SectionProps<TConfig> {
  readonly config: TConfig;
  readonly design: SectionDesign;
  readonly section: PublicSectionData;
}

/** セクションデザイン（全タイプ共通ビジュアル設定） */
export interface SectionDesign {
  readonly backgroundColor?: string;
  readonly padding?: string;
  readonly containerWidth?: string;
}

/** SectionRenderer に渡される DB セクションデータ */
export interface PublicSectionData {
  readonly id: string;
  readonly type: string;
  readonly title: string | null;
  readonly contentHtml: string;
  readonly contentJson: unknown;
  readonly isActive: boolean;
}
