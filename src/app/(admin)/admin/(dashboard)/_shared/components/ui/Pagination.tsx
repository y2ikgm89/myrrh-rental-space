/**
 * 管理画面リスト用ページネーション（nuqs で URL 同期）。
 *
 * @see src/app/(public)/_shared/components/Pagination.tsx — 公開側は Link ベース。
 * ページ番号の省略ロジックやアクセシビリティを変える場合は両方を確認すること。
 */
"use client";

import { useTransition } from "react";
import { useQueryState } from "nuqs";
import { Button } from "@/admin/components/ui";
import { parseAsPage } from "@/shared/lib/nuqs";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  total: number;
  /** nuqs のページ番号クエリキー（既定: `page`） */
  pageUrlKey?: string;
};

/**
 * ページ番号の配列を生成
 * 7ページ以下: 全表示
 * 8ページ以上: 省略記号付き（現在ページ周辺を表示）
 */
function getPageNumbers(
  current: number,
  total: number,
): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [1];

  if (current > 3) {
    pages.push("ellipsis");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("ellipsis");
  }

  pages.push(total);

  return pages;
}

export function Pagination({
  currentPage,
  totalPages,
  total,
  pageUrlKey = "page",
}: PaginationProps) {
  const [isPending, startTransition] = useTransition();

  const [, setPage] = useQueryState(
    pageUrlKey,
    parseAsPage.withOptions({
      shallow: false,
      history: "push",
      startTransition,
    }),
  );

  const goToPage = (page: number) => {
    void setPage(page === 1 ? null : page);
  };

  if (totalPages <= 1) {
    return <div className="text-sm text-muted-foreground">全 {total} 件</div>;
  }

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <nav
      aria-label="ページネーション"
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="text-sm text-muted-foreground">
        全 {total} 件（{currentPage} / {totalPages} ページ）
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1 || isPending}
        >
          前へ
        </Button>

        {pageNumbers.map((page, i) =>
          page === "ellipsis" ? (
            <span
              /* eslint-disable-next-line @eslint-react/no-array-index-key */
              key={`ellipsis-${i}`}
              aria-hidden
              className="flex h-8 w-8 items-center justify-center text-sm text-muted-foreground"
            >
              ...
            </span>
          ) : (
            <Button
              key={page}
              variant={page === currentPage ? "default" : "outline"}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => goToPage(page)}
              disabled={isPending}
              aria-current={page === currentPage ? "page" : undefined}
            >
              {page}
            </Button>
          ),
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages || isPending}
        >
          次へ
        </Button>
      </div>
    </nav>
  );
}
