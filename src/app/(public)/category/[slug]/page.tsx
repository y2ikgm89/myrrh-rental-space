import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  canonicalUrlForPage,
  readCanonicalPage,
} from "@/public/lib/seo/paginated-canonical";
import type { SearchParams } from "nuqs/server";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import { paginationSearchParams } from "@/public/lib/search-params";
import { getBaseUrl } from "@/shared/lib/constants";
import {
  getPostCategoryBySlug,
  getPublishedPostsList,
} from "@/shared/domain/posts/queries";
import { buildCategoryPath } from "@/shared/domain/posts/routing";
import { requireFeatureEnabled } from "@/shared/domain/features/check";
import { withFeatureGate } from "@/public/lib/seo/feature-gated-metadata";
import { TaxonomyArchiveView } from "../../_components/post-list/taxonomy-archive-view";

const POSTS_PER_PAGE = 12;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  // ページ送りの 2 ページ目以降は自己参照 canonical にする（監査 A-90）。
  const page = readCanonicalPage((await searchParams)["page"]);
  return withFeatureGate("posts", async () => {
    const [category, settings] = await Promise.all([
      getPostCategoryBySlug(slug),
      getSeoSettings(),
    ]);
    if (!category) {
      return {
        title: "カテゴリが見つかりません",
        robots: { index: false, follow: false },
      };
    }

    return await generateArticleMetadata(
      {
        title: category.metaTitle ?? `${category.name}の記事`,
        description: category.metaDescription ?? category.description,
        image: category.ogpImageUrl,
        ogpTitle: category.metaTitle,
        ogpDescription: category.metaDescription,
      },
      settings,
      {
        canonicalUrl: canonicalUrlForPage(
          `${getBaseUrl()}${buildCategoryPath(category.slug)}`,
          page,
        ),
        ogType: "website",
      },
    );
  });
}

export default async function CategoryArchivePage({
  params,
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("posts");

  const { slug } = await params;
  const category = await getPostCategoryBySlug(slug);
  if (!category) notFound();

  const { page } = await paginationSearchParams.parse(searchParams);
  const currentPage = Math.max(1, page);
  const { posts, totalPages } = await getPublishedPostsList(
    currentPage,
    POSTS_PER_PAGE,
    "",
    category.slug,
    "",
  );

  return (
    <TaxonomyArchiveView
      eyebrow="Category"
      title={category.name}
      description={category.description}
      posts={posts}
      currentPage={currentPage}
      totalPages={totalPages}
      basePath={buildCategoryPath(category.slug)}
    />
  );
}
