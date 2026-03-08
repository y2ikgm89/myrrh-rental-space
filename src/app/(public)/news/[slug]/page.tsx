import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  NewsDetailPageContent,
  buildNewsMetadata,
} from "../_components/NewsDetailPageContent";
import { getPublishedNewsItem } from "@/shared/domain/news/queries";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildNewsMetadata(slug);
}

export default async function NewsDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const newsItem = await getPublishedNewsItem(slug);

  if (!newsItem) {
    notFound();
  }

  return <NewsDetailPageContent newsItem={newsItem} />;
}
