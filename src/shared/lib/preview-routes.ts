/**
 * 投稿プレビュー URL を生成（Next.js 16 server-side preview パターン）。
 * `(public)/preview/posts/[id]/page.tsx` が DB から `getPostByIdForPreview(id)` で
 * 最新 draft を fetch する。
 */
export function getPostPreviewHref(id: string): string {
  return `/preview/posts/${id}`;
}

/**
 * お知らせプレビュー URL を生成（Next.js 16 server-side preview パターン）。
 * `(public)/preview/news/[id]/page.tsx` が DB から `getNewsByIdForPreview(id)` で
 * 最新 draft を fetch する。
 */
export function getNewsPreviewHref(id: string): string {
  return `/preview/news/${id}`;
}

export function getPagePreviewHref(slug: string): string {
  return `/preview/pages/${slug || "home"}`;
}

export function getPublicPageHref(slug: string): string {
  return slug === "home" ? "/" : `/${slug}`;
}

/**
 * Preview URL を対応する本番 public URL に正規化する。
 *
 * `(public)/preview/{posts,news,pages}/[id|slug]` 配下で `(public)` root layout を
 * 共有する設計 (2026-05-20) では、`usePathname()` は `/preview/posts/<id>` を返す。
 * ヘッダーナビ / モバイルナビの `aria-current` 判定は本番 URL (`/posts` 等) を
 * 想定するため、preview pathname を正規化してから active 判定に渡す。
 *
 * @param pathname - `usePathname()` で取得した現在 pathname
 * @returns 本番 public URL 相当 (preview でなければそのまま返す)
 */
export function normalizePreviewPathname(pathname: string): string {
  if (pathname.startsWith("/preview/posts/")) return "/posts";
  if (pathname.startsWith("/preview/news/")) return "/news";
  if (pathname.startsWith("/preview/pages/")) {
    const slug = pathname.split("/")[3] ?? "";
    return slug === "home" ? "/" : `/${slug}`;
  }
  return pathname;
}
