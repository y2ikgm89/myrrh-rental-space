/**
 * /terms/[slug] — 規約詳細公開ページ
 *
 * 最新の公開バージョン（isCurrentVersion=true, status=PUBLISHED）を表示する。
 */

import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { BreadcrumbJsonLd } from "@/public/components/seo/JsonLd";
import { generateArticleMetadata } from "@/public/lib/seo/metadata-factory";
import { getBaseUrl } from "@/shared/lib/constants";
import { toISOString } from "@/shared/lib/serialize";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { getPublicTermsBySlug } from "@/public/actions/terms";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  const terms = await getPublicTermsBySlug(slug);

  if (!terms || !terms.currentVersion) {
    return { title: "規約が見つかりません" };
  }

  return generateArticleMetadata(
    {
      title: terms.title,
      description: `${terms.title}をご確認ください。`,
    },
    {
      canonicalUrl: `${getBaseUrl()}/terms/${slug}`,
    },
  );
}

export default async function TermsDetailPage({ params }: PageProps) {
  await connection();

  const { slug } = await params;
  const terms = await getPublicTermsBySlug(slug);

  if (!terms || !terms.currentVersion) {
    notFound();
  }

  const baseUrl = getBaseUrl();
  const publishedAt = toISOString(terms.currentVersion.publishedAt);

  return (
    <main className="mx-auto max-w-3xl px-5 py-16 md:px-8 md:py-24">
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: baseUrl },
          { name: terms.title, url: `${baseUrl}/terms/${slug}` },
        ]}
      />

      <article>
        <header className="mb-10 border-b pb-8">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {terms.title}
          </h1>
          {publishedAt && (
            <p className="mt-3 text-sm text-muted-foreground">
              最終更新:{" "}
              <time dateTime={publishedAt}>
                {new Date(publishedAt).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </p>
          )}
        </header>

        <SanitizedHtml
          html={terms.currentVersion.contentHtml}
          className="prose prose-stone max-w-none"
        />
      </article>
    </main>
  );
}
