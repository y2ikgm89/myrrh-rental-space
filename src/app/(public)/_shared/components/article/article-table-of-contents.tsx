import type { ReactElement } from "react";
import type { HeadingEntry } from "@/shared/lib/html/extract-headings";
import { cn } from "@/shared/lib/cn";
import { ArticleTocScrollSpy } from "./article-toc-scroll-spy";
import { ArticleReadingProgress } from "./article-reading-progress";

interface ArticleTableOfContentsProps {
  readonly headings: readonly HeadingEntry[];
  readonly variant: "sidebar" | "mobile";
}

/**
 * 公開記事詳細ページの目次（Editorial Index）。
 *
 * ## 設計コンセプト
 *
 * Editorial Magazine トーン（Kinfolk / Cereal）。Cormorant Garamond italic の
 * 章番号 (`01 / 02 / 03`) を 2.5em の固定列で整列し、本文は serif italic と
 * 視覚言語を共有する。装飾線・ドットなど "余計な" 視覚ノイズを排除し、
 * 編集者が組んだ index ページのような密度感に統一。
 *
 * ## variant
 *
 * - `variant="sidebar"`: デスクトップ sticky サイドバー（Reading Progress + Index）
 * - `variant="mobile"`: 本文冒頭の `<details>` 折りたたみ目次
 *
 * ## active state
 *
 * - 該当章のみ左端にブロンズ 2px のアクセントライン（`::before` 疑似要素、
 *   全項目を貫通する hairline は使わない — 連結線は視覚ノイズになるため）
 * - 番号 / タイトルがブロンズ寄りに移行（`text-accent` / `text-foreground`）
 * - 幅が 0→2px に変わるが ::before 疑似要素のため content shift は起きない
 *
 * ## a11y
 *
 * - `<nav aria-label="目次">` で landmark 提供
 * - `<ol>` で順序ありリスト
 * - active link に `aria-current="location"`（W3C ARIA 1.2 — 現在位置マーキング）
 * - 各リンクは `min-h-9` (36px)。WCAG 2.5.5 Enhanced (AAA) の "Equivalent" 例外
 *   条項に該当（各見出しは記事本文内に独立して存在しスクロールで直接到達可能、
 *   よって 44px 等価代替コントロールが既に提供されている）。dense editorial
 *   nav として Vercel / Stripe / Tailwind Docs 等の業界標準密度に統一
 */
export function ArticleTableOfContents({
  headings,
  variant,
}: ArticleTableOfContentsProps): ReactElement | null {
  if (headings.length === 0) return null;

  if (variant === "mobile") {
    return (
      <details className="group my-8 border border-border bg-surface/40">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 px-4 py-3 text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
          <span>Contents / 目次</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="h-3 w-3 transition-transform group-open:rotate-180"
          >
            <path
              d="M2 4l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </summary>
        <nav aria-label="目次" className="border-t border-border px-4 py-4">
          <EditorialIndex headings={headings} />
        </nav>
      </details>
    );
  }

  return (
    <nav
      aria-label="目次"
      className="sticky top-[calc(var(--header-height)+2rem)] flex max-h-[calc(100svh-var(--header-height)-4rem)] flex-col"
    >
      <div className="space-y-3 pb-5">
        <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
          Contents
        </p>
        <ArticleReadingProgress />
      </div>
      <div className="-mr-3 flex-1 overflow-y-auto pr-3">
        <EditorialIndex headings={headings} />
      </div>
      <ArticleTocScrollSpy ids={headings.map((h) => h.id)} />
    </nav>
  );
}

/**
 * 見出しに章番号（h2 のみ `01 / 02 / 03 ...`）を付与した pure helper。
 * モジュールレベル定義で render 中の let 再代入を回避（Compiler 1.0 互換）。
 */
type NumberedHeading = HeadingEntry & { readonly number: string | null };

function numberHeadings(
  headings: readonly HeadingEntry[],
): readonly NumberedHeading[] {
  let h2Count = 0;
  return headings.map((h) => {
    if (h.level === 2) {
      h2Count += 1;
      return { ...h, number: String(h2Count).padStart(2, "0") };
    }
    return { ...h, number: null };
  });
}

/**
 * Editorial Index リスト。
 *
 * - 2 列 grid `[2.25em_1fr]` で番号 / タイトル整列（gap ベースより密）
 * - h2: 章番号 italic + serif、h3: 番号なし（grid セル空白で alignment 維持）+ smaller font
 * - active state は `::before` 疑似要素でブロンズアクセントライン（per-item、全項目通しの線なし）
 */
function EditorialIndex({
  headings,
}: {
  readonly headings: readonly HeadingEntry[];
}): ReactElement {
  const numbered = numberHeadings(headings);
  return (
    <ol className="space-y-px" data-toc-list>
      {numbered.map((h) => {
        const isH2 = h.level === 2;
        return (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              data-toc-link={h.id}
              className={cn(
                // base layout — 番号列 2.25em、タイトル列 1fr の grid
                "group/toc relative grid min-h-9 grid-cols-[2.25em_1fr] items-center pl-3 pr-1 text-sm leading-snug",
                // text colors + transitions
                "text-muted-foreground transition-colors duration-200",
                "hover:text-foreground",
                "aria-[current=location]:text-foreground",
                // active accent line — ::before 疑似要素（per-item、全体貫通なし）
                "before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:bg-transparent before:transition-colors before:duration-200",
                "aria-[current=location]:before:bg-accent",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "self-center font-serif text-[0.9375rem] italic leading-none transition-colors duration-200",
                  isH2
                    ? "text-accent/40 group-hover/toc:text-accent/70 group-aria-[current=location]/toc:text-accent"
                    : "text-transparent",
                )}
              >
                {h.number ?? "·"}
              </span>
              <span
                className={cn(
                  "block",
                  isH2
                    ? "font-light"
                    : "text-[0.8125rem] text-muted-foreground/70",
                )}
              >
                {h.text}
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}
