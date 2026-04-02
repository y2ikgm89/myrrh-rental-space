/**
 * /terms/[slug] — 規約詳細公開ページ（Page-First アーキテクチャ）
 *
 * 最新の公開バージョン（isCurrentVersion=true, status=PUBLISHED）を表示する。
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { generateArticleMetadata } from "@/public/lib/seo/metadata-factory";
import { getBaseUrl } from "@/shared/lib/constants";
import { toISOString } from "@/shared/lib/serialize";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { getPublicTermsBySlug } from "@/shared/domain/terms/queries";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";

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

  const publishedAt = toISOString(terms.currentVersion.publishedAt);

  return (
    <>
      <PageHero
        variant="compact"
        title={terms.title}
        breadcrumb={
          <Breadcrumb
            items={[
              { label: "利用規約", href: "/terms" },
              { label: terms.title },
            ]}
          />
        }
      />

      <article className="py-[var(--spacing-section)]">
        <Container variant="narrow">
          {publishedAt ? (
            <p className="mb-8 text-sm text-muted-foreground">
              最終更新:{" "}
              <time dateTime={publishedAt}>
                {/* eslint-disable-next-line @eslint-react/purity -- Server Component: new Date() is safe here */}
                {new Date(publishedAt).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </p>
          ) : null}

          <SanitizedHtml
            html={terms.currentVersion.contentHtml}
            className="prose prose-invert max-w-none"
          />
        </Container>
      </article>

      <SiteCTA />
    </>
  );
}
