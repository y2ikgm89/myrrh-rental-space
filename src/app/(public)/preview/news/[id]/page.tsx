import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { NewsDetailPageContent } from "@/app/(public)/news/_components/news-detail-page-content";
import { PreviewBanner } from "@/public/components/ui/preview-banner";
import { verifyAdminSession } from "@/shared/lib/admin-auth";
import { getNewsByIdForPreview } from "@/shared/domain/news/preview-queries";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "お知らせプレビュー",
  robots: { index: false, follow: false },
};

export default async function NewsPreviewPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();
  await verifyAdminSession();

  const { id } = await params;
  const newsItem = await getNewsByIdForPreview(id);

  if (!newsItem) {
    notFound();
  }

  return (
    <NewsDetailPageContent newsItem={newsItem} banner={<PreviewBanner />} />
  );
}
