import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  PostDetailPageContent,
  buildPostMetadata,
} from "../_components/post-detail-page-content";
import { getPublishedPost } from "@/shared/domain/posts/queries";
import { requireFeatureEnabled } from "@/shared/lib/features/check";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  return buildPostMetadata(slug);
}

export default async function BlogPostPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("posts");

  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  return <PostDetailPageContent post={post} />;
}
