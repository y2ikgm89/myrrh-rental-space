import type { Metadata } from "next";
import { connection } from "next/server";
import { ArticleLayout } from "@/public/components/layouts/article-layout";
import { PreviewBanner } from "@/public/components/ui/preview-banner";
import { NewsPreviewContent } from "../../_components/news-preview-content";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "お知らせプレビュー",
  robots: { index: false, follow: false },
};

export default async function NewsPreviewPage({ params }: PageProps) {
  await connection();

  const { slug } = await params;
  return (
    <ArticleLayout
      banner={<PreviewBanner />}
      showSidebar={false}
      showCta={false}
    >
      <NewsPreviewContent identifier={slug} />
    </ArticleLayout>
  );
}
