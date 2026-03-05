/**
 * プレビュー機能用型定義
 *
 * エディタで編集中のコンテンツを保存前にプレビューするための型定義
 */

import { z } from "zod";

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * 投稿プレビューデータスキーマ
 */
export const PostPreviewDataSchema = z.object({
  title: z.string(),
  slug: z.string(),
  excerpt: z.string(),
  contentHtml: z.string(),
  thumbnailUrl: z.string(),
  publishedAt: z.string().nullable(),
  tags: z.array(z.string()),
  category: z.object({
    name: z.string(),
    slug: z.string(),
  }),
});

/**
 * ニュースプレビューデータスキーマ
 */
export const NewsPreviewDataSchema = z.object({
  title: z.string(),
  slug: z.string(),
  contentHtml: z.string(),
  publishedAt: z.string().nullable(),
});

/**
 * ページプレビューデータスキーマ
 *
 * Note: content は廃止（セクションシステムに移行済み）
 */
export const PagePreviewDataSchema = z.object({
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  showSidebar: z.boolean(),
});

/**
 * プレビューデータコンテナのベーススキーマ
 */
const PreviewDataBaseSchema = z.object({
  version: z.literal(1),
  timestamp: z.number(),
});

/**
 * コンテンツタイプ別のプレビューデータコンテナスキーマ
 */
export const PostPreviewContainerSchema = PreviewDataBaseSchema.extend({
  contentType: z.literal("post"),
  data: PostPreviewDataSchema,
});

export const NewsPreviewContainerSchema = PreviewDataBaseSchema.extend({
  contentType: z.literal("news"),
  data: NewsPreviewDataSchema,
});

export const PagePreviewContainerSchema = PreviewDataBaseSchema.extend({
  contentType: z.literal("page"),
  data: PagePreviewDataSchema,
});

/**
 * プレビューデータのunionスキーマ
 */
export const PreviewContainerSchema = z.discriminatedUnion("contentType", [
  PostPreviewContainerSchema,
  NewsPreviewContainerSchema,
  PagePreviewContainerSchema,
]);

// =============================================================================
// Preview Data Types
// =============================================================================

/**
 * 投稿プレビューデータ
 */
export type PostPreviewData = {
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  thumbnailUrl: string;
  publishedAt: string | null;
  tags: string[];
  category: {
    name: string;
    slug: string;
  };
};

/**
 * ニュースプレビューデータ
 */
export type NewsPreviewData = {
  title: string;
  slug: string;
  contentHtml: string;
  publishedAt: string | null;
};

/**
 * ページプレビューデータ
 *
 * Note: content は廃止（セクションシステムに移行済み）
 */
export type PagePreviewData = {
  title: string;
  slug: string;
  description: string | null;
  showSidebar: boolean;
};

// =============================================================================
// Preview Container Type
// =============================================================================

/**
 * プレビューデータコンテナ
 *
 * セッションストレージに保存される形式
 */
export type PreviewData<T> = {
  /** バージョン（将来の互換性のため） */
  version: 1;
  /** 保存時刻（ミリ秒） */
  timestamp: number;
  /** コンテンツタイプ */
  contentType: "post" | "news" | "page";
  /** 実際のプレビューデータ */
  data: T;
};

// =============================================================================
// Constants
// =============================================================================

/** プレビューデータの有効期限（30分） */
export const PREVIEW_EXPIRY_MS = 30 * 60 * 1000;

/** プレビュー用セッションストレージキーのプレフィックス */
export const PREVIEW_STORAGE_PREFIX = "preview-";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * プレビュー用ストレージキーを生成
 *
 * @param contentType - コンテンツタイプ
 * @param identifier - スラッグまたは識別子
 * @returns ストレージキー
 */
export function getPreviewStorageKey(
  contentType: "post" | "news" | "page",
  identifier: string,
): string {
  return `${PREVIEW_STORAGE_PREFIX}${contentType}-${identifier}`;
}

/**
 * プレビューデータが有効期限内かチェック
 *
 * @param timestamp - データの保存時刻
 * @returns 有効期限内の場合 true
 */
export function isPreviewDataValid(timestamp: number): boolean {
  return Date.now() - timestamp < PREVIEW_EXPIRY_MS;
}
