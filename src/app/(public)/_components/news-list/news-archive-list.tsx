/**
 * NewsList (archive variant) — お知らせ一覧の長い順次リスト。
 *
 * **a11y design notes** (2026-05-15):
 * - ScrollRevealGroup は使用しない。長い archive list で fold 外要素が
 *   opacity:0 のまま残ると、axe-core が opacity 継承を考慮して effective
 *   contrast (foreground × parent opacity) を washed-out 色で計算し
 *   color-contrast violation を発火する (axe-public-pages.spec.ts /news fail
 *   の root cause)。visual showcase ではなく text 主体の archive のため
 *   editorial animation は不要 — Kinfolk Journal / NYTimes archive 準拠。
 * - `<time>` と `<h2>` には明示的 `text-foreground` を base state に設定し、
 *   inheritance を経由せず WCAG AA 4.5:1 を保証。hover で accent に遷移して
 *   discovery hint を提供。
 */

import type { ReactElement } from "react";
import Link from "next/link";
import { Button } from "@/public/components/design-system/button";
import { Heading } from "@/public/components/design-system/heading";
import { PublicEmptyState } from "@/public/components/ui/empty-state";
import { formatSerializedDate } from "@/shared/lib/serialize";
import { toAppRoute } from "@/shared/lib/typed-routes";

interface NewsItemData {
  id: string;
  slug: string;
  url: string;
  title: string;
  publishedAt: string | null;
}

interface NewsListProps {
  items: readonly NewsItemData[];
  /** 検索クエリ。0 件時の文言と「検索を解除」導線の出し分けに使う。 */
  query?: string;
}

export function NewsList({ items, query = "" }: NewsListProps): ReactElement {
  if (items.length === 0) {
    const hasQuery = query.length > 0;
    return (
      <PublicEmptyState
        message={
          hasQuery
            ? "条件に一致するお知らせが見つかりませんでした"
            : "お知らせはまだありません。"
        }
        action={
          hasQuery ? (
            <Button variant="editorial" size="sm" href="/news">
              検索を解除
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="divide-y divide-divider">
      {items.map((item) => (
        <Link
          key={item.id}
          href={toAppRoute(item.url)}
          className="group flex items-baseline gap-4 py-5 transition-colors hover:bg-accent/10 md:gap-6 md:py-6"
        >
          <time
            dateTime={item.publishedAt ?? undefined}
            className="shrink-0 text-xs text-foreground md:text-sm"
          >
            {formatSerializedDate(item.publishedAt)}
          </time>

          <Heading
            level={2}
            className="!text-sm font-medium text-foreground transition-colors group-hover:text-accent md:!text-base"
          >
            {item.title}
          </Heading>
        </Link>
      ))}
    </div>
  );
}
