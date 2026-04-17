import type { Metadata } from "next";
import { connection } from "next/server";
import { ArticleLayout } from "@/public/components/layouts/article-layout";
import { PreviewBanner } from "@/public/components/ui/preview-banner";
import { PostPreviewContent } from "../../_components/post-preview-content";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "投稿プレビュー",
  robots: { index: false, follow: false },
};

export default async function PostPreviewPage({ params }: PageProps) {
  await connection();

  const { slug } = await params;
  return (
    <ArticleLayout
      banner={<PreviewBanner />}
      showSidebar={false}
      showCta={false}
    >
      <PostPreviewContent identifier={slug} />
    </ArticleLayout>
  );
}
