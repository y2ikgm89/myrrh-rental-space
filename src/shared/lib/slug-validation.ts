/**
 * スラッグバリデーションユーティリティ
 *
 * 全コンテンツタイプで統一されたスラッグ衝突チェックを提供
 *
 * @module shared/lib/slug-validation
 */

import { findSlugConflict } from "@/shared/domain/slugs/queries";

// =============================================================================
// Types
// =============================================================================

/** コンテンツタイプ */
export type ContentType = "post" | "news" | "page" | "space";

/** スラッグチェック結果 */
export type SlugCheckResult =
  { available: true } | { available: false; reason: SlugUnavailableReason };

/** スラッグが使用できない理由 */
export type SlugUnavailableReason =
  | { type: "reserved"; path: string }
  | { type: "conflict"; contentType: ContentType; id: string };

// =============================================================================
// Reserved Paths
// =============================================================================

/**
 * 予約済みパス
 *
 * これらのパスはシステムで使用されるため、スラッグとして使用不可
 */
const RESERVED_PATHS: ReadonlySet<string> = new Set([
  // System routes
  "admin",
  "api",
  "_next",
  // Public routes (fixed) — システムページ slug。seed は本チェックを通らないため
  // ここに列挙しても seed は阻害されず、カスタムページが奪うことだけを防ぐ。
  "about",
  "contact",
  "faq",
  "news",
  "blog",
  "events",
  "access",
  "reservation",
  "spaces",
  "terms",
  "privacy",
  // 旧ブログ一覧 URL（/blog へ 308 redirect されるため実体ページ作成は無意味）
  "posts",
  "p",
  // 分類アーカイブ / プレビューのルートプレフィックス（システムページではないが
  // /category/[slug]・/tag/[slug]・/preview/* と衝突するため予約）
  "category",
  "tag",
  "preview",
  // SEO/Static
  "sitemap.xml",
  "robots.txt",
  "favicon.ico",
]);

/**
 * 予約済みパスかどうかをチェック
 */
export function isReservedPath(slug: string): boolean {
  return RESERVED_PATHS.has(slug.toLowerCase());
}

/**
 * 予約済みパス一覧を取得（UI表示用）
 */
export function getReservedPaths(): readonly string[] {
  return Array.from(RESERVED_PATHS).sort();
}

// =============================================================================
// Slug Availability Check
// =============================================================================

type CheckOptions = {
  /** 現在のコンテンツタイプ（自分自身のチェックを除外） */
  currentType: ContentType;
  /** 更新時の現在のID（自分自身を除外） */
  currentId?: string | undefined;
};

/**
 * スラッグが使用可能かチェック
 *
 * 以下をチェック:
 * 1. 予約済みパスでないこと
 * 2. 他のコンテンツタイプで使用されていないこと
 * 3. 同じコンテンツタイプで使用されていないこと（更新時は自分を除く）
 *
 * @param slug - チェックするスラッグ
 * @param options - チェックオプション
 * @returns スラッグチェック結果
 *
 * @example
 * ```ts
 * // 新規作成時
 * const result = await checkSlugAvailability('my-article', { currentType: 'post' })
 *
 * // 更新時（自分のスラッグは除外）
 * const result = await checkSlugAvailability('my-article', {
 *   currentType: 'post',
 *   currentId: 'existing-post-id'
 * })
 * ```
 */
export async function checkSlugAvailability(
  slug: string,
  options: CheckOptions,
): Promise<SlugCheckResult> {
  const normalizedSlug = slug.toLowerCase();
  const { currentType, currentId } = options;

  // 1. 予約済みパスチェック
  if (isReservedPath(normalizedSlug)) {
    return {
      available: false,
      reason: { type: "reserved", path: normalizedSlug },
    };
  }

  // 2. 全コンテンツタイプでの重複チェック
  const conflict = await findSlugConflict(
    normalizedSlug,
    currentType,
    currentId,
  );

  if (conflict) {
    return {
      available: false,
      reason: {
        type: "conflict",
        contentType: conflict.contentType,
        id: conflict.id,
      },
    };
  }

  return { available: true };
}

// =============================================================================
// Error Message Generation
// =============================================================================

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  post: "投稿",
  news: "お知らせ",
  page: "ページ",
  space: "スペース",
};

/**
 * スラッグ衝突理由からエラーメッセージを生成
 */
export function getSlugErrorMessage(reason: SlugUnavailableReason): string {
  switch (reason.type) {
    case "reserved":
      return `「${reason.path}」はシステムで予約されているため使用できません`;
    case "conflict":
      return `このスラッグは既に${CONTENT_TYPE_LABELS[reason.contentType]}で使用されています`;
  }
}
