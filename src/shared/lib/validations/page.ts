/**
 * ページバリデーション（共有部分）
 *
 * システムページ定義とスラッグ関連のユーティリティ
 * admin/public両方で使用
 */

import { z } from "zod";

// =============================================================================
// システムページ定義
// =============================================================================

/**
 * システムページ定義
 *
 * システムページは削除不可。セクションシステムで編集可能。
 * すべてのページは /[slug] で統一されたURLで表示される。
 * ヒーローセクション等は Page レコードに紐づく Section として管理。
 *
 * Note: コンテンツ本体は各専用管理ページで管理
 * - posts/news → /admin/posts, /admin/news
 * - terms → /admin/terms（Termsテーブルで管理）
 */
export interface SystemPageDefinition {
  slug: string;
  title: string;
  description: string;
}

export const SYSTEM_PAGES: readonly SystemPageDefinition[] = [
  { slug: "home", title: "ホームページ", description: "トップページ" },
  { slug: "about", title: "会社概要", description: "会社・サービスについて" },
  { slug: "faq", title: "よくある質問", description: "FAQ" },
  { slug: "reservation", title: "予約", description: "レンタルスペースの予約" },
  {
    slug: "spaces",
    title: "スペース一覧",
    description: "ご利用可能なレンタルスペース",
  },
  {
    slug: "contact",
    title: "お問い合わせ",
    description: "お問い合わせフォーム",
  },
  {
    slug: "access",
    title: "アクセス",
    description: "最寄り駅・駐車場・営業時間のご案内",
  },
  { slug: "posts", title: "ブログ", description: "ブログ記事一覧" },
  { slug: "news", title: "お知らせ", description: "ニュース・お知らせ一覧" },
  { slug: "terms", title: "利用規約", description: "ご利用にあたっての規約" },
];

export const SYSTEM_PAGE_SLUGS = SYSTEM_PAGES.map((p) => p.slug);

/**
 * スラッグからシステムページ定義を取得
 */
export function getSystemPageDefinition(
  slug: string,
): SystemPageDefinition | undefined {
  return SYSTEM_PAGES.find((p) => p.slug === slug);
}

/**
 * システムページかどうかを判定
 */
export function isSystemPageSlug(slug: string): boolean {
  return SYSTEM_PAGE_SLUGS.includes(slug);
}

/**
 * ページが削除可能かどうかを判定
 * システムページは削除不可
 */
export function canDeletePage(slug: string): boolean {
  return !isSystemPageSlug(slug);
}

// =============================================================================
// バリデーションスキーマ（admin用、ここからre-export）
// =============================================================================

/**
 * SEO/OGP更新用バリデーションスキーマ（システムページ用）
 */
export const updatePageSeoSchema = z.object({
  title: z
    .string()
    .min(1, { error: "タイトルは必須です" })
    .max(200, { error: "タイトルは200文字以内です" }),
  metaDescription: z
    .string()
    .max(160, { error: "メタディスクリプションは160文字以内です" })
    .optional(),
  metaKeywords: z
    .string()
    .max(200, { error: "メタキーワードは200文字以内です" })
    .optional(),
  ogpTitle: z
    .string()
    .max(100, { error: "OGPタイトルは100文字以内です" })
    .optional(),
  ogpDescription: z
    .string()
    .max(200, { error: "OGP説明は200文字以内です" })
    .optional(),
  ogpImageUrl: z
    .string()
    .url({ error: "有効なURLを入力してください" })
    .optional()
    .or(z.literal("")),
});

export type UpdatePageSeoInput = z.infer<typeof updatePageSeoSchema>;

/**
 * ページ作成用バリデーションスキーマ
 */
export const createPageSchema = z.object({
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(100, { error: "スラッグは100文字以内です" })
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      error: "スラッグは半角英数字とハイフンのみ使用可能です",
    }),
  title: z
    .string()
    .min(1, { error: "タイトルは必須です" })
    .max(200, { error: "タイトルは200文字以内です" }),
  isPublished: z.boolean().default(false),
});

export type CreatePageInput = z.infer<typeof createPageSchema>;
