import type { Metadata } from "next";
import { PostPreviewContent } from "../../_components/PostPreviewContent";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "投稿プレビュー",
  robots: { index: false, follow: false },
};

export default async function PostPreviewPage({ params }: PageProps) {
  const { slug } = await params;
  return <PostPreviewContent identifier={slug} />;
}
