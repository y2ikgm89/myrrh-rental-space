import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PostDetailPageContent } from "@/app/(public)/posts/_components/post-detail-page-content";
import { PreviewBanner } from "@/public/components/ui/preview-banner";
import { verifyAdminSession } from "@/shared/lib/admin-auth";
import { getPostByIdForPreview } from "@/shared/domain/posts/preview-queries";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "投稿プレビュー",
  robots: { index: false, follow: false },
};

export default async function PostPreviewPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();
  await verifyAdminSession();

  const { id } = await params;
  const post = await getPostByIdForPreview(id);

  if (!post) {
    notFound();
  }

  return <PostDetailPageContent post={post} banner={<PreviewBanner />} />;
}
