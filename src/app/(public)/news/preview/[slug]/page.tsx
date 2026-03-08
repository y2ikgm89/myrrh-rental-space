import type { Metadata } from "next";
import { NewsPreviewContent } from "../../_components/NewsPreviewContent";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "お知らせプレビュー",
  robots: { index: false, follow: false },
};

export default async function NewsPreviewPage({ params }: PageProps) {
  const { slug } = await params;
  return <NewsPreviewContent identifier={slug} />;
}
