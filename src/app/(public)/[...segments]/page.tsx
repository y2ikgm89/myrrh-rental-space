/**
 * 公開側の catch-all。DB 上の公開ページを slug で引き、無ければ `notFound()`。
 *
 * **ここで `notFound()` を呼んでも HTTP ステータスは 200 になる。** バグでは
 * なく、`cacheComponents: true`（PPR）+ `loading.tsx` による streaming 下では
 * ステータスが先に送信済みで変更できないため。Next.js が代わりに
 * `<meta name="robots" content="noindex">` を注入するので index はされない。
 *
 * 直そうとする前に [ADR 0004](../../../../docs/adr/0004-accept-soft-404-under-streaming.md)
 * を読むこと。回避策は公式に存在するが、PPR を実質的に捨てることになる。
 *
 * @module app/(public)/[...segments]/page
 */

import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BreadcrumbJsonLd } from "@/public/components/seo/json-ld";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPublicPage } from "@/shared/domain/pages/queries";
import { getPageSections } from "@/shared/domain/sections/queries";
import { ManagedPageSections } from "@/public/components/pages/ManagedPageSections";

interface PageProps {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<SearchParams>;
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

export default async function DynamicPage({ params, searchParams }: PageProps) {
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
          <ManagedPageSections
            sections={sections}
            pageSlug={slug}
            searchParams={searchParams}
          />
        </>
      );
    }
  }

  notFound();
}
