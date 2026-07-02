import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BreadcrumbJsonLd } from "@/public/components/seo/json-ld";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPublicPage } from "@/shared/domain/pages/queries";
import { getPageSections } from "@/shared/domain/sections/queries";
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

  return {
    title: "ページが見つかりません",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function DynamicPage({ params }: PageProps) {
  await connection();

  const { segments } = await params;
  const slug = segments[0];

  if (segments.length === 1 && slug) {
    const page = await getPublicPage(slug);

    if (page) {
      const sections = await getPageSections(page.id);

      return (
        <>
          <BreadcrumbJsonLd
            items={[
              { name: "ホーム", url: "/" },
              { name: page.title, url: `/${slug}` },
            ]}
          />
          <ManagedPageSections sections={sections} pageSlug={slug} />
        </>
      );
    }
  }

  notFound();
}
