import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { SearchParams } from "nuqs/server";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import { paginationSearchParams } from "@/public/lib/search-params";
import { getBaseUrl } from "@/shared/lib/constants";
import {
  getPostTagBySlug,
  getPublishedPostsList,
} from "@/shared/domain/posts/queries";
import { buildTagPath } from "@/shared/domain/posts/routing";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { TaxonomyArchiveView } from "../../_components/post-list/taxonomy-archive-view";

const POSTS_PER_PAGE = 12;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const [tag, settings] = await Promise.all([
    getPostTagBySlug(slug),
    getSeoSettings(),
  ]);
  if (!tag) return { title: "タグが見つかりません" };

  const options: { canonicalUrl: string; siteName?: string } = {
    canonicalUrl: `${getBaseUrl()}${buildTagPath(tag.slug)}`,
  };
  if (settings?.siteName) options.siteName = settings.siteName;

  return generateArticleMetadata(
    {
      title: tag.metaTitle ?? `${tag.name}の記事`,
      description: tag.metaDescription ?? tag.description,
      image: tag.ogpImageUrl,
      ogpTitle: tag.metaTitle,
      ogpDescription: tag.metaDescription,
    },
    options,
  );
}

export default async function TagArchivePage({
  params,
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("posts");

  const { slug } = await params;
  const tag = await getPostTagBySlug(slug);
  if (!tag) notFound();

  const { page } = await paginationSearchParams.parse(searchParams);
  const currentPage = Math.max(1, page);
  const { posts, totalPages } = await getPublishedPostsList(
    currentPage,
    POSTS_PER_PAGE,
    "",
    "",
    tag.slug,
  );

  return (
    <TaxonomyArchiveView
      eyebrow="Tag"
      title={tag.name}
      description={tag.description}
      posts={posts}
      currentPage={currentPage}
      totalPages={totalPages}
      basePath={buildTagPath(tag.slug)}
    />
  );
}
