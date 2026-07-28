import "server-only";

import { findSlugConflict } from "@/shared/domain/slugs/queries";

/** コンテンツタイプ */
export type ContentType = "post" | "news" | "page" | "space";

/** スラッグチェック結果 */
export type SlugCheckResult =
  { available: true } | { available: false; reason: SlugUnavailableReason };

/** スラッグが使用できない理由 */
export type SlugUnavailableReason =
  | { type: "reserved"; path: string }
  | { type: "conflict"; contentType: ContentType; id: string };

const RESERVED_PATHS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "_next",
  "home",
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
  "login",
  "mypage",
  "category",
  "tag",
  "preview",
  "claim",
  "receipts",
  "sitemap.xml",
  "robots.txt",
  "favicon.ico",
  "feed.xml",
  "llms.txt",
  "manifest.webmanifest",
  "icon",
  "icon-192",
  "icon-512",
]);

export function isReservedPath(slug: string): boolean {
  return RESERVED_PATHS.has(slug.toLowerCase());
}

export function getReservedPaths(): readonly string[] {
  return Array.from(RESERVED_PATHS).sort();
}

type CheckOptions = {
  currentType: ContentType;
  currentId?: string | undefined;
};

export async function checkSlugAvailability(
  slug: string,
  options: CheckOptions,
): Promise<SlugCheckResult> {
  const normalizedSlug = slug.toLowerCase();
  const { currentType, currentId } = options;

  if (isReservedPath(normalizedSlug)) {
    return {
      available: false,
      reason: { type: "reserved", path: normalizedSlug },
    };
  }

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

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  post: "投稿",
  news: "お知らせ",
  page: "ページ",
  space: "スペース",
};

export function getSlugErrorMessage(reason: SlugUnavailableReason): string {
  switch (reason.type) {
    case "reserved":
      return `「${reason.path}」はシステムで予約されているため使用できません`;
    case "conflict":
      return `このスラッグは既に${CONTENT_TYPE_LABELS[reason.contentType]}で使用されています`;
  }
}
