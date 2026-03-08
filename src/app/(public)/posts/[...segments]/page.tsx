import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  PostDetailPageContent,
  buildPostMetadata,
} from "../_components/PostDetailPageContent";
import { getPublishedPost } from "@/shared/domain/posts/queries";
import { resolvePostDetailRoute } from "@/shared/domain/posts/routing";

interface PageProps {
  params: Promise<{ segments: string[] }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { segments } = await params;
  const route = resolvePostDetailRoute(segments);

  if (!route) {
    return { title: "記事が見つかりません" };
  }

  return buildPostMetadata(route.slug);
}

export default async function PostDetailPage({ params }: PageProps) {
  const { segments } = await params;
  const route = resolvePostDetailRoute(segments);

  if (!route) {
    notFound();
  }

  const post = await getPublishedPost(route.slug);
  if (!post) {
    notFound();
  }

  return <PostDetailPageContent post={post} />;
}
