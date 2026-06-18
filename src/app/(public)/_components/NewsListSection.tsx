/**
 * NewsListSection — variant dispatcher (Server Component)
 *
 * `displayLayout` が "archive" のときは SearchBar + NewsList +
 * Pagination を内包したアーカイブ表示を、それ以外（list / card）の
 * ときは既存の NewsListSimpleView (CC) を描画する。
 *
 * 公開ページ /news は本セクションの "archive" variant に統一テンプレート化されており、
 * SectionRenderer は searchParams を受け取って paginated データ を fetch して
 * `mode={{ kind: "archive", ... }}` で渡す。
 */

import { Suspense, type ReactElement } from "react";
import { SearchBar } from "@/public/components/ui/search-bar";
import { Pagination } from "@/public/components/pagination";
import type { NewsListConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

import {
  NewsListSimpleView,
  type NewsData,
} from "./news-list/news-list-simple-view";
import { NewsList } from "./news-list/news-archive-list";

export type { NewsData };

interface ArchiveNewsItem {
  readonly id: string;
  readonly slug: string;
  readonly url: string;
  readonly title: string;
  readonly publishedAt: string | null;
}

export type NewsListMode =
  | { readonly kind: "simple"; readonly news: readonly NewsData[] }
  | {
      readonly kind: "archive";
      readonly items: readonly ArchiveNewsItem[];
      readonly currentPage: number;
      readonly totalPages: number;
      readonly query: string;
    };

interface NewsListSectionProps {
  readonly config: NewsListConfig;
  readonly style: SectionStylePayload;
  readonly mode: NewsListMode;
}

export function NewsListSection({
  config,
  style,
  mode,
}: NewsListSectionProps): ReactElement {
  if (mode.kind === "archive") {
    const preservedQuery: Record<string, string | undefined> = {};
    if (mode.query) preservedQuery["q"] = mode.query;

    return (
      <section className="pt-10 pb-[var(--spacing-md)] md:pt-14">
        <div className="mx-auto max-w-[var(--container-max)] px-[var(--container-padding)]">
          <Suspense fallback={null}>
            <div className="mb-8 max-w-md">
              <SearchBar placeholder="お知らせを検索..." />
            </div>
          </Suspense>
          <NewsList items={mode.items} query={mode.query} />
          <Pagination
            currentPage={mode.currentPage}
            totalPages={mode.totalPages}
            basePath="/news"
            {...(Object.keys(preservedQuery).length > 0
              ? { preservedQuery }
              : {})}
          />
        </div>
      </section>
    );
  }

  return <NewsListSimpleView config={config} style={style} news={mode.news} />;
}
