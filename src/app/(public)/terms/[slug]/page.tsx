/**
 * /terms/[slug] — 規約詳細公開ページ（Page-First アーキテクチャ）
 *
 * 最新の公開バージョン（isCurrentVersion=true, status=PUBLISHED）を表示する。
 * 本文に h2 が 2 本以上ある場合は posts/news と同じ sticky TOC サイドバーを出す
 * （管理画面の sidebarTocEnabled トグルで全体無効化も可能）。
 */

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
import { LayoutWidth } from "@/shared/types/prisma";

/** 目次を表示するための最低 h2 数。これ未満なら TOC を非表示にする。 */
const TOC_MIN_H2 = 2;

/**
 * 規約の標準コンテンツ幅。
 * 法的文書は読みやすさ重視で MD（800px）を固定採用する。
 * 記事型（posts/news）のような per-resource レイアウト設定は持たない。
 */
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
  const [terms, sidebarSettings] = await Promise.all([
    getPublicTermsBySlug(slug),
    getSidebarSettings(),
  ]);

  if (!terms || !terms.currentVersion) {
    notFound();
  }

  const headings = extractHeadingsFromHtml(terms.currentVersion.contentHtml);
  const h2Count = headings.filter((h) => h.level === 2).length;
  const showToc = sidebarSettings.tocEnabled && h2Count >= TOC_MIN_H2;

  return (
    <ArticleLayout
      breadcrumb={[{ label: terms.title }]}
      contentWidth={TERMS_CONTENT_WIDTH}
      showSidebar={false}
      {...(showToc && {
        toc: <ArticleTableOfContents variant="sidebar" headings={headings} />,
        mobileToc: (
          <ArticleTableOfContents variant="mobile" headings={headings} />
        ),
      })}
    >
      <ArticleHeader
        title={terms.title}
        publishedAt={terms.currentVersion.publishedAt}
      />
      <Prose variant="editorial" className="max-w-none">
        <SanitizedHtml html={terms.currentVersion.contentHtml} />
      </Prose>
    </ArticleLayout>
  );
}
