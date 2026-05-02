import type { ReactElement } from "react";
import type { HeadingEntry } from "@/shared/lib/html/extract-headings";
import { cn } from "@/shared/lib/cn";
import { ArticleTableOfContentsScrollSpy } from "./article-table-of-contents-scroll-spy";

interface ArticleTableOfContentsProps {
  readonly headings: readonly HeadingEntry[];
  readonly variant: "sidebar" | "mobile";
}

/**
 * 公開記事詳細ページの目次（Table of Contents）。
 *
 * - `variant="sidebar"`: デスクトップの sticky サイドバー目次。
 *   IntersectionObserver ベースのスクロールスパイでアクティブ見出しをハイライトする
 *   （ArticleTableOfContentsScrollSpy Client Component）。
 * - `variant="mobile"`: 本文冒頭の `<details>` 折りたたみ目次。スクロールスパイなし
 *   （モバイルでは sticky 配置が本文を圧迫するため）。
 *
 * 見出しは `extractHeadings()` で事前抽出済み。h2 (level 2) と h3 (level 3) を扱う。
 * 閾値判定（h2 が 2 個未満なら非表示）は呼び出し側の責務。
 *
 * デザイン: Editorial Magazine トーン（serif heading + tracking + 控えめ accent）。
 */
export function ArticleTableOfContents({
  headings,
  variant,
}: ArticleTableOfContentsProps): ReactElement | null {
  if (headings.length === 0) return null;

  if (variant === "mobile") {
    return (
      <details className="group my-6 border border-border bg-surface/60">
        <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
          <span>目次</span>
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
          <TocList headings={headings} />
        </nav>
      </details>
    );
  }

  return (
    <nav
      aria-label="目次"
      className="sticky top-[calc(var(--header-height)+2rem)] max-h-[calc(100svh-var(--header-height)-4rem)] overflow-y-auto"
    >
      <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        目次
      </p>
      <div className="mt-4">
        <TocList headings={headings} />
        <ArticleTableOfContentsScrollSpy ids={headings.map((h) => h.id)} />
      </div>
    </nav>
  );
}

function TocList({
  headings,
}: {
  readonly headings: readonly HeadingEntry[];
}): ReactElement {
  return (
    <ol className="space-y-2 text-sm" data-toc-list>
      {headings.map((h) => (
        <li key={h.id} className={cn(h.level === 3 && "pl-4")}>
          <a
            href={`#${h.id}`}
            data-toc-link={h.id}
            className="block border-l-2 border-transparent py-0.5 pl-3 text-muted-foreground transition-colors hover:text-foreground aria-[current=location]:border-accent aria-[current=location]:text-foreground"
          >
            {h.text}
          </a>
        </li>
      ))}
    </ol>
  );
}
