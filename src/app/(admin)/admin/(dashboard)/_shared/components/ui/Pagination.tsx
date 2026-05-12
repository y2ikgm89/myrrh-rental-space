/**
 * 管理画面リスト用ページネーション。
 *
 * 構成（Carbon Design System / shadcn / WAI-ARIA Landmarks 準拠）:
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ 11-20 / 全 400 件      [10 ▾]    [< 前へ] [1] [2] [3] … [40] [次へ >] │
 *   └────────────────────────────────────────────────────────────────────┘
 *     ↑ 表示範囲             ↑ 表示件数 Select   ↑ Prev / 番号 / Next
 *
 * - `<nav aria-label="ページネーション">` ルート
 * - アクティブページは `aria-current="page"` (HTML 仕様 / shadcn 慣行)
 * - 全インタラクティブ要素は `min-h-11` (WCAG 2.5.5 Enhanced AAA)
 * - perPage 変更時は page=1 にリセット (Carbon / Material 標準挙動)
 * - nuqs `withDefault(defaultPerPage)` の clearOnDefault でデフォルト値は URL から自動除外
 *
 * @see src/app/(public)/_shared/components/Pagination.tsx — 公開ページ用は別実装 (Link ベース)
 */
"use client";

import { useTransition } from "react";
import { useQueryStates } from "nuqs";
import { parseAsInteger } from "nuqs";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { parseAsPage } from "@/shared/lib/nuqs";
import { cn } from "@/shared/lib/cn";

export const DEFAULT_PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  total: number;
  perPage: number;
  /** nuqs のページ番号クエリキー (default: `page`) */
  pageUrlKey?: string;
  /** nuqs の表示件数クエリキー (default: `perPage`) */
  perPageUrlKey?: string;
  /** Select に表示する選択肢 (default: `[10, 20, 50, 100]`) */
  perPageOptions?: readonly number[];
  /** 表示件数のデフォルト値。upstream parser の withDefault と一致させる (default: `10`) */
  defaultPerPage?: number;
};

/**
 * 7ページ以下: 全表示
 * 8ページ以上: 1, ..., 周辺, ..., last の省略形
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
  perPage,
  pageUrlKey = "page",
  perPageUrlKey = "perPage",
  perPageOptions = DEFAULT_PER_PAGE_OPTIONS,
  defaultPerPage = 10,
}: PaginationProps) {
  const [isPending, startTransition] = useTransition();

  // 1 オブジェクトで page / perPage を同時更新 (perPage 変更時の page リセットを atomic に)
  const [, setParams] = useQueryStates(
    {
      [pageUrlKey]: parseAsPage,
      [perPageUrlKey]: parseAsInteger.withDefault(defaultPerPage),
    },
    {
      shallow: false,
      history: "push",
      startTransition,
    },
  );

  const goToPage = (page: number) => {
    void setParams({ [pageUrlKey]: page === 1 ? null : page });
  };

  const handlePerPageChange = (next: string) => {
    const parsed = Number(next);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    void setParams({
      [perPageUrlKey]: parsed,
      [pageUrlKey]: null,
    });
  };

  // 現在 perPage が選択肢に含まれない場合 (URL を手で書き換えた等) は先頭に追加して表示崩れを防ぐ
  const visibleOptions = perPageOptions.includes(perPage)
    ? perPageOptions
    : ([perPage, ...perPageOptions] as const);

  const rangeStart = total === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const rangeEnd = Math.min(currentPage * perPage, total);
  const rangeText =
    total === 0 ? `全 0 件` : `${rangeStart}-${rangeEnd} / 全 ${total} 件`;

  return (
    <nav
      aria-label="ページネーション"
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      {/* 左: 表示範囲 + 表示件数 Select */}
      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-4">
        <span aria-live="polite">{rangeText}</span>

        <div className="flex items-center gap-2">
          <label
            htmlFor={`${perPageUrlKey}-select`}
            className="whitespace-nowrap"
          >
            表示件数
          </label>
          <Select
            value={String(perPage)}
            onValueChange={handlePerPageChange}
            disabled={isPending}
          >
            <SelectTrigger
              id={`${perPageUrlKey}-select`}
              className="min-h-11 w-auto min-w-20"
              aria-label="1ページあたりの表示件数"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibleOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 右: Prev / 番号 / Next (totalPages <= 1 では非表示) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            className="min-w-11"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1 || isPending}
            aria-label="前のページへ移動"
          >
            <IconChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="ml-1 hidden sm:inline">前へ</span>
          </Button>

          {getPageNumbers(currentPage, totalPages).map((page, i) =>
            page === "ellipsis" ? (
              <span
                /* eslint-disable-next-line @eslint-react/no-array-index-key */
                key={`ellipsis-${i}`}
                aria-hidden="true"
                className={cn(
                  "inline-flex min-h-11 min-w-11 items-center justify-center",
                  "text-sm text-muted-foreground",
                )}
              >
                …
              </span>
            ) : (
              <Button
                key={page}
                variant={page === currentPage ? "default" : "outline"}
                size="sm"
                className="min-w-11 px-0"
                onClick={() => goToPage(page)}
                disabled={isPending}
                aria-label={`${page} ページ目へ移動`}
                aria-current={page === currentPage ? "page" : undefined}
              >
                {page}
              </Button>
            ),
          )}

          <Button
            variant="outline"
            size="sm"
            className="min-w-11"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages || isPending}
            aria-label="次のページへ移動"
          >
            <span className="mr-1 hidden sm:inline">次へ</span>
            <IconChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </nav>
  );
}
