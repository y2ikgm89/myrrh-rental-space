import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { TermsDetailPageContent } from "@/app/(public)/terms/_components/terms-detail-page-content";
import { PreviewBanner } from "@/public/components/ui/preview-banner";
import { verifyAdminSession } from "@/shared/lib/admin-auth";
import { getTermsByIdForPreview } from "@/shared/domain/terms/preview-queries";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: "規約プレビュー",
  robots: { index: false, follow: false },
};

export default async function TermsPreviewPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();
  await verifyAdminSession();

  const { id } = await params;
  const terms = await getTermsByIdForPreview(id);

  if (!terms) {
    notFound();
  }

  return <TermsDetailPageContent terms={terms} banner={<PreviewBanner />} />;
}
