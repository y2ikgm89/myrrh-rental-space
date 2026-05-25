import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { generateArticleMetadata } from "@/public/lib/seo/metadata-factory";
import { getBaseUrl } from "@/shared/lib/constants";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { getPublicTermsBySlug } from "@/shared/domain/terms/queries";
import { getSidebarSettings } from "@/shared/domain/settings/queries/sidebar";
import { ArticleLayout } from "@/public/components/layouts/article-layout";
import { ArticleHeader } from "@/public/components/layouts/article-header";
import { ArticleTableOfContents } from "@/public/components/article/article-table-of-contents";
import { Prose } from "@/public/components/design-system/prose";
import { extractHeadingsFromHtml } from "@/shared/lib/html/extract-headings";
import { formatSerializedDate, toISOString } from "@/shared/lib/serialize";
import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";

const TOC_MIN_H2 = 2;
const TERMS_CONTENT_WIDTH = LayoutWidth.MD;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  const terms = await getPublicTermsBySlug(slug);

  if (!terms) {
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
  const [terms, sidebarSettings] = await Promise.all([
    getPublicTermsBySlug(slug),
    getSidebarSettings(),
  ]);

  if (!terms) {
    notFound();
  }

  const headings = extractHeadingsFromHtml(terms.contentHtml);
  const h2Count = headings.filter((h) => h.level === 2).length;
  const showToc = sidebarSettings.tocEnabled && h2Count >= TOC_MIN_H2;

  const publishedAtIso = toISOString(terms.publishedAt);
  const headerMeta = publishedAtIso ? (
    <time dateTime={publishedAtIso} className="font-heading text-sm font-light">
      {formatSerializedDate(publishedAtIso)} 施行
    </time>
  ) : null;

  return (
    <ArticleLayout
      breadcrumb={[
        { label: "規約一覧", href: "/terms" },
        { label: terms.title },
      ]}
      contentWidth={TERMS_CONTENT_WIDTH}
      showSidebar={false}
      heroPosition="in-grid"
      hero={
        <ArticleHeader
          eyebrow="Terms"
          title={terms.title}
          {...(headerMeta && { meta: headerMeta })}
        />
      }
      {...(showToc && {
        toc: <ArticleTableOfContents variant="sidebar" headings={headings} />,
        mobileToc: (
          <ArticleTableOfContents variant="mobile" headings={headings} />
        ),
      })}
    >
      <Prose variant="editorial" className="max-w-none">
        <SanitizedHtml html={terms.contentHtml} />
      </Prose>
    </ArticleLayout>
  );
}
