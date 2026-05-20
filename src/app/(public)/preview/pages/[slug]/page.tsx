import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { verifyAdminSession } from "@/shared/lib/admin-auth";
import { getPageBySlugQuery } from "@/shared/domain/pages/admin-queries";
import { getPageForEditQuery } from "@/shared/domain/sections/admin-queries";
import { ManagedPageSections } from "@/public/components/pages/ManagedPageSections";
import { PreviewBanner } from "@/public/components/ui/preview-banner";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const metadata: Metadata = {
  title: "ページプレビュー",
  robots: { index: false, follow: false },
};

export default async function ManagedPagePreviewPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();
  await verifyAdminSession();

  const { slug } = await params;
  const pageMeta = await getPageBySlugQuery(slug);

  if (!pageMeta) {
    notFound();
  }

  const page = await getPageForEditQuery(slug);

  if (!page) {
    notFound();
  }

  const activeSections = page.sections.filter((section) => section.isActive);

  return (
    <>
      <PreviewBanner />
      <ManagedPageSections sections={activeSections} pageSlug={page.slug} />
    </>
  );
}
