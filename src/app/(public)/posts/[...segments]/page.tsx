import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  PostDetailPageContent,
  buildPostMetadata,
} from "../_components/post-detail-page-content";
import { getPublishedPost } from "@/shared/domain/posts/queries";
import { resolvePostDetailRoute } from "@/shared/domain/posts/routing";
import { requireFeatureEnabled } from "@/shared/lib/features/check";

interface PageProps {
  params: Promise<{ segments: string[] }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { segments } = await params;
  const route = resolvePostDetailRoute(segments);

  if (!route) {
    return { title: "記事が見つかりません" };
  }

  return buildPostMetadata(route.slug);
}

export default async function PostDetailPage({ params }: PageProps) {
  await connection();
  await requireFeatureEnabled("posts");

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
