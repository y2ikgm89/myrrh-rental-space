/**
 * TaxonomyArchiveView — カテゴリ / タグ別アーカイブの共通描画（Server Component）
 *
 * `/category/[slug]` と `/tag/[slug]` が共有する。見出し（分類名 + 説明）は `/posts` の
 * hero(minimal) セクションに揃えた全幅・中央寄せ。その下の PostGrid + Pagination を
 * BlogLayout（サイドバー）で包む。分類は URL パスで確定済みのため、`/posts` archive と
 * 違いカテゴリフィルタ UI は持たない（絞り込みは専用ページへの遷移で表現する）。
 */

import type { ReactElement } from "react";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { BlogLayout } from "@/public/components/layouts/blog-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { Heading } from "@/public/components/design-system/heading";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Pagination } from "@/public/components/pagination";
import { BreadcrumbJsonLd } from "@/public/components/seo/json-ld";
import { getBaseUrl } from "@/shared/lib/constants";

import { PostGrid, type PostCardData } from "./post-grid";

interface TaxonomyArchiveViewProps {
  /** 分類種別ラベル（"Category" / "Tag"） */
  readonly eyebrow: string;
  /** 分類名（カテゴリ名 / タグ名） */
  readonly title: string;
  /** 分類の説明（任意） */
  readonly description: string | null;
  readonly posts: readonly PostCardData[];
  readonly currentPage: number;
  readonly totalPages: number;
  /** Pagination / breadcrumb 用の正規パス（"/category/{slug}" など） */
  readonly basePath: string;
}

export function TaxonomyArchiveView({
  eyebrow,
  title,
  description,
  posts,
  currentPage,
  totalPages,
  basePath,
}: TaxonomyArchiveViewProps): ReactElement {
  const baseUrl = getBaseUrl();

  return (
    <PageLayout variant="content" cta={<SiteCTA />}>
      <BreadcrumbJsonLd
        items={[
          { name: "ブログ", url: `${baseUrl}/blog` },
          { name: title, url: `${baseUrl}${basePath}` },
        ]}
      />
      <section className="pt-10 pb-[var(--spacing-md)] md:pt-14">
        <div className="mx-auto max-w-[var(--container-max)] px-[var(--container-padding)]">
          <header className="mb-10 text-center md:mb-14">
            <SectionLabel>{eyebrow}</SectionLabel>
            <div className="mt-4">
              <Heading level={1} className="text-page-hero tracking-tight">
                {title}
              </Heading>
            </div>
            {description ? (
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base">
                {description}
              </p>
            ) : null}
          </header>
          <BlogLayout>
            <PostGrid posts={posts} hasFilters={false} />
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              basePath={basePath}
            />
          </BlogLayout>
        </div>
      </section>
    </PageLayout>
  );
}
