import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BreadcrumbJsonLd } from "@/public/components/seo/json-ld";
import {
  PostDetailPageContent,
  buildPostMetadata,
} from "../posts/_components/post-detail-page-content";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPublishedPost } from "@/shared/domain/posts/queries";
import { resolvePostDetailRoute } from "@/shared/domain/posts/routing";
import { getPublicPage } from "@/shared/domain/pages/queries";
import { getPageSections } from "@/shared/domain/sections/queries";
import {
  getPermalinkSettings,
  getPublicSettingsForStyle,
} from "@/shared/domain/settings/queries/display";
import { ManagedPageSections } from "@/public/components/pages/ManagedPageSections";

interface PageProps {
  params: Promise<{ segments: string[] }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { segments } = await params;
  const slug = segments[0];

  if (segments.length === 1 && slug) {
    const page = await getPublicPage(slug);
    if (page) {
      return generatePageMetadata(slug);
    }
  }

  const settings = await getPermalinkSettings();
  if (settings?.postUrlPrefixEnabled ?? true) {
    return { title: "ページが見つかりません" };
  }

  const route = resolvePostDetailRoute(segments);
  if (!route) {
    return { title: "ページが見つかりません" };
  }

  return buildPostMetadata(route.slug);
}

export default async function DynamicPage({ params }: PageProps) {
  await connection();

  const { segments } = await params;
  const slug = segments[0];

  if (segments.length === 1 && slug) {
    const page = await getPublicPage(slug);

    if (page) {
      const [sections, settings] = await Promise.all([
        getPageSections(page.id),
        getPublicSettingsForStyle(),
      ]);

      return (
        <>
          <BreadcrumbJsonLd
            items={[
              { name: "ホーム", url: "/" },
              { name: page.title, url: `/${slug}` },
            ]}
          />
          <ManagedPageSections
            sections={sections}
            pageStyle={page.pageStyle}
            settings={settings}
          />
        </>
      );
    }
  }

  const settings = await getPermalinkSettings();
  if (settings?.postUrlPrefixEnabled ?? true) {
    notFound();
  }

  const route = resolvePostDetailRoute(segments);
  if (!route) {
    notFound();
  }

  const post = await getPublishedPost(route.slug);
  if (!post) {
    notFound();
  }

  return <PostDetailPageContent post={post} />;
}
