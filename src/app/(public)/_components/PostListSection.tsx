/**
 * PostListSection — variant dispatcher (Server Component)
 *
 * `displayLayout` が "archive" のときは SearchBar + PostCategoryFilter +
 * PostGrid + Pagination を BlogLayout で包んだアーカイブ表示を、
 * それ以外（grid / list）のときは既存の PostListSimpleView (CC) を描画する。
 *
 * 公開ページ /blog は本セクションの "archive" variant に統一テンプレート化されており、
 * SectionRenderer は searchParams を受け取って paginated データ + categories を
 * fetch して `mode={{ kind: "archive", ... }}` で渡す。
 */

import { Suspense, type ReactElement } from "react";
import { BlogLayout } from "@/public/components/layouts/blog-layout";
import { SearchBar } from "@/public/components/ui/search-bar";
import { Pagination } from "@/public/components/pagination";
import type { PostListConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

import {
  PostListSimpleView,
  type PostData,
} from "./post-list/post-list-simple-view";
import { PostGrid } from "./post-list/post-grid";
import { PostCategoryFilter } from "./post-list/post-category-filter";

export type { PostData };

interface CategoryOption {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

interface ArchivePost {
  readonly id: string;
  readonly slug: string;
  readonly url: string;
  readonly title: string;
  readonly excerpt: string;
  readonly thumbnailUrl: string;
  readonly publishedAt: string | null;
  readonly category: { readonly name: string; readonly slug: string };
}

export type PostListMode =
  | { readonly kind: "simple"; readonly posts: readonly PostData[] }
  | {
      readonly kind: "archive";
      readonly posts: readonly ArchivePost[];
      readonly categories: readonly CategoryOption[];
      readonly currentPage: number;
      readonly totalPages: number;
      readonly query: string;
    };

interface PostListSectionProps {
  readonly config: PostListConfig;
  readonly style: SectionStylePayload;
  readonly mode: PostListMode;
}

export function PostListSection({
  config,
  style,
  mode,
}: PostListSectionProps): ReactElement {
  if (mode.kind === "archive") {
    const hasFilters = Boolean(mode.query);
    const preservedQuery: Record<string, string | undefined> = {};
    if (mode.query) preservedQuery["q"] = mode.query;

    return (
      <section className="pt-10 pb-[var(--spacing-fluid-md)] md:pt-14">
        <div className="mx-auto max-w-[var(--container-max)] px-[var(--container-padding)]">
          <BlogLayout>
            <Suspense fallback={null}>
              <div className="mb-8 max-w-md">
                <SearchBar placeholder="記事を検索..." />
              </div>
            </Suspense>
            <Suspense fallback={null}>
              <PostCategoryFilter categories={mode.categories} />
            </Suspense>
            <PostGrid posts={mode.posts} hasFilters={hasFilters} />
            <Pagination
              currentPage={mode.currentPage}
              totalPages={mode.totalPages}
              basePath="/blog"
              {...(Object.keys(preservedQuery).length > 0
                ? { preservedQuery }
                : {})}
            />
          </BlogLayout>
        </div>
      </section>
    );
  }

  return (
    <PostListSimpleView config={config} style={style} posts={mode.posts} />
  );
}
