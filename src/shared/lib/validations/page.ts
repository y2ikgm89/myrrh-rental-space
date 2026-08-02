/**
 * ページバリデーション（共有部分）
 *
 * システムページ定義とスラッグ関連のユーティリティ
 * admin/public両方で使用
 */

import { z } from "zod";
import { SEO_LIMITS } from "./seo";
import { SLUG_REGEX } from "./params";

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
  { slug: "blog", title: "ブログ", description: "ブログ記事一覧" },
  { slug: "news", title: "お知らせ", description: "ニュース・お知らせ一覧" },
  {
    slug: "events",
    title: "イベント",
    description: "イベントカレンダー・一覧",
  },
  {
    slug: "terms",
    title: "規約一覧",
    description: "利用規約・プライバシーポリシー・キャンセルポリシー等の一覧",
  },
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
    .trim()
    .min(1, { error: "タイトルは必須です" })
    .max(200, { error: "タイトルは200文字以内です" }),
  metaDescription: z
    .string()
    .trim()
    .max(SEO_LIMITS.META_DESCRIPTION, {
      error: `メタディスクリプションは${SEO_LIMITS.META_DESCRIPTION}文字以内です`,
    })
    .optional(),
  metaKeywords: z
    .string()
    .trim()
    .max(SEO_LIMITS.META_KEYWORDS, {
      error: `メタキーワードは${SEO_LIMITS.META_KEYWORDS}文字以内です`,
    })
    .optional(),
  ogpTitle: z
    .string()
    .trim()
    .max(SEO_LIMITS.OGP_TITLE, {
      error: `OGPタイトルは${SEO_LIMITS.OGP_TITLE}文字以内です`,
    })
    .optional(),
  ogpDescription: z
    .string()
    .trim()
    .max(SEO_LIMITS.OGP_DESCRIPTION, {
      error: `OGP説明は${SEO_LIMITS.OGP_DESCRIPTION}文字以内です`,
    })
    .optional(),
  ogpImageUrl: z
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
    .trim()
    .min(1, { error: "スラッグは必須です" })
    .max(100, { error: "スラッグは100文字以内です" })
    .regex(SLUG_REGEX, {
      error: "スラッグは半角英数字とハイフンのみ使用可能です",
    }),
  title: z
    .string()
    .trim()
    .min(1, { error: "タイトルは必須です" })
    .max(200, { error: "タイトルは200文字以内です" }),
  isPublished: z.boolean().default(false),
});

export type CreatePageInput = z.infer<typeof createPageSchema>;
