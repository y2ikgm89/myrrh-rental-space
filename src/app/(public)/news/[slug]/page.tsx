import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  NewsDetailPageContent,
  buildNewsMetadata,
} from "../_components/news-detail-page-content";
import { getPublishedNewsItem } from "@/shared/domain/news/queries";
import { requireFeatureEnabled } from "@/shared/lib/features/check";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  return buildNewsMetadata(slug);
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
