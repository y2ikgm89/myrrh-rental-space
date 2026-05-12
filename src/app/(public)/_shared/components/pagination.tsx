/**
 * 公開ページ用ページネーション（`Link` + `URLSearchParams`）。
 *
 * @see src/app/(admin)/admin/(dashboard)/_shared/components/ui/Pagination.tsx — 管理側は nuqs。
 * ページ番号の省略ロジックやアクセシビリティを変える場合は両方を確認すること。
 */
import type { ReactElement } from "react";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import { toAppRoute } from "@/shared/lib/typed-routes";

function buildPageHref(
  basePath: string,
  page: number,
  preservedQuery: Readonly<Record<string, string | undefined>> | undefined,
): string {
  const sp = new URLSearchParams();
  if (preservedQuery) {
    for (const [key, value] of Object.entries(preservedQuery)) {
      if (value !== undefined && value !== "") {
        sp.set(key, value);
      }
    }
  }
  if (page > 1) {
    sp.set("page", String(page));
  }
  const qs = sp.toString();
  return qs === "" ? basePath : `${basePath}?${qs}`;
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  /**
   * ページ切替時も URL に残すクエリ（例: スペース一覧の category）。
   * `page` は本コンポーネントが上書きする。
   */
  preservedQuery?: Readonly<Record<string, string | undefined>>;
}

// WCAG 2.5.5 Enhanced — `min-h-11` で 44px ヒットエリア確保
const PAGE_LINK_BASE =
  "inline-flex min-h-11 min-w-11 items-center justify-center border px-3 py-2 text-sm transition-colors";
const PAGE_LINK_INACTIVE =
  "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground";

export function Pagination({
  currentPage,
  totalPages,
  basePath,
  preservedQuery,
}: PaginationProps): ReactElement | null {
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  function getHref(page: number): string {
    return buildPageHref(basePath, page, preservedQuery);
  }

  return (
    <nav
      aria-label="ページネーション"
      className="mt-16 flex items-center justify-center gap-2"
    >
      {currentPage > 1 && (
        <Link
          href={toAppRoute(getHref(currentPage - 1))}
          className={cn(PAGE_LINK_BASE, PAGE_LINK_INACTIVE)}
        >
          前へ
        </Link>
      )}

      {start > 1 && (
        <>
          <Link
            href={toAppRoute(getHref(1))}
            className={cn(PAGE_LINK_BASE, PAGE_LINK_INACTIVE)}
          >
            1
          </Link>
          {start > 2 && (
            <span aria-hidden className="px-2 text-sm text-muted-foreground">
              ...
            </span>
          )}
        </>
      )}

      {pages.map((page) => (
        <Link
          key={page}
          href={toAppRoute(getHref(page))}
          className={cn(
            PAGE_LINK_BASE,
            page === currentPage
              ? "border-accent bg-accent text-accent-foreground"
              : PAGE_LINK_INACTIVE,
          )}
          aria-current={page === currentPage ? "page" : undefined}
        >
          {page}
        </Link>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && (
            <span aria-hidden className="px-2 text-sm text-muted-foreground">
              ...
            </span>
          )}
          <Link
            href={toAppRoute(getHref(totalPages))}
            className={cn(PAGE_LINK_BASE, PAGE_LINK_INACTIVE)}
          >
            {totalPages}
          </Link>
        </>
      )}

      {currentPage < totalPages && (
        <Link
          href={toAppRoute(getHref(currentPage + 1))}
          className={cn(PAGE_LINK_BASE, PAGE_LINK_INACTIVE)}
        >
          次へ
        </Link>
      )}
    </nav>
  );
}
