import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  NewsDetailPageContent,
  buildNewsMetadata,
} from "../_components/news-detail-page-content";
import { getPublishedNewsItem } from "@/shared/domain/news/queries";
import { requireFeatureEnabled } from "@/shared/domain/features/check";
import { withFeatureGate } from "@/public/lib/seo/feature-gated-metadata";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  return withFeatureGate("news", () => buildNewsMetadata(slug));
}

export default async function NewsDetailPage({ params }: PageProps) {
  await connection();
  await requireFeatureEnabled("news");

  const { slug } = await params;
  const newsItem = await getPublishedNewsItem(slug);

  if (!newsItem) {
    notFound();
  }

  return <NewsDetailPageContent newsItem={newsItem} />;
}
