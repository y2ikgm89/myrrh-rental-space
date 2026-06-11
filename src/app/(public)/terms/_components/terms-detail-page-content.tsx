import type { ReactElement, ReactNode } from "react";
import { ArticleLayout } from "@/public/components/layouts/article-layout";
import { ArticleHeader } from "@/public/components/layouts/article-header";
import { ArticleTableOfContents } from "@/public/components/article/article-table-of-contents";
import { Prose } from "@/public/components/design-system/prose";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { getSidebarSettings } from "@/shared/domain/settings/queries/sidebar";
import { extractHeadingsFromHtml } from "@/shared/lib/html/extract-headings";
import { formatSerializedDate, toISOString } from "@/shared/lib/serialize";
import { TERMS_CONTENT_WIDTH } from "@/shared/lib/validations/terms";

/** 目次を表示するための最低 h2 数。これ未満なら TOC を非表示にする。 */
const TOC_MIN_H2 = 2;

type TermsDetailPageContentProps = {
  terms: {
    title: string;
    contentHtml: string;
    publishedAt: string | null;
  };
  banner?: ReactNode;
};

/**
 * 規約詳細の本番描画 SSoT。公開 `/terms/[slug]` と管理プレビュー
 * `/preview/terms/[id]` の両方が同一の章組み (ArticleLayout + TOC + Prose) で
 * 描画されることを保証する (posts / news の `*DetailPageContent` と同パターン)。
 */
export async function TermsDetailPageContent({
  terms,
  banner,
}: TermsDetailPageContentProps): Promise<ReactElement> {
  const sidebarSettings = await getSidebarSettings();

  const headings = extractHeadingsFromHtml(terms.contentHtml);
  const h2Count = headings.filter((h) => h.level === 2).length;
  const showToc = sidebarSettings.tocEnabled && h2Count >= TOC_MIN_H2;

  const publishedAtIso = toISOString(terms.publishedAt);
  const headerMeta = publishedAtIso ? (
    <time dateTime={publishedAtIso}>
      {formatSerializedDate(publishedAtIso)} 施行
    </time>
  ) : null;

  return (
    <ArticleLayout
      {...(banner !== undefined && { banner })}
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
