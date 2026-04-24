import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPageBySlug } from "@/admin/queries/page";
import { getPageBuilderForEdit } from "@/admin/queries/page-builder";
import { getPageForEdit } from "@/admin/queries/page-section";
import { HomepageSections } from "@/public/components/homepage/HomepageSections";
import { ManagedPageSections } from "@/public/components/pages/ManagedPageSections";
import { PreviewBanner } from "@/public/components/ui/preview-banner";
import { getPublicSettingsForStyle } from "@/shared/domain/settings/queries/display";
import { FreeformPageRenderer } from "@/shared/page-builder/renderer/FreeformPageRenderer";

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

  const { slug } = await params;
  const pageMeta = await getPageBySlug(slug);

  if (!pageMeta) {
    notFound();
  }

  if (!pageMeta.isSystemPage) {
    const page = await getPageBuilderForEdit(slug);
    if (!page) {
      notFound();
    }

    return (
      <div className="min-h-screen bg-background text-foreground">
        <PreviewBanner />
        <FreeformPageRenderer
          document={page.draftDocument}
          media={page.media}
          formMode="preview"
        />
      </div>
    );
  }

  const [page, settings] = await Promise.all([
    getPageForEdit(slug),
    getPublicSettingsForStyle(),
  ]);

  if (!page) {
    notFound();
  }

  const activeSections = page.sections.filter((section) => section.isActive);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PreviewBanner />
      {page.slug === "home" ? (
        <HomepageSections
          pageHero={page.pageHero}
          sections={activeSections.filter(
            (section) => section.type !== "homepage-hero",
          )}
          pageStyle={page.pageStyle}
          settings={settings}
        />
      ) : (
        <ManagedPageSections
          sections={activeSections}
          pageStyle={page.pageStyle}
          settings={settings}
        />
      )}
    </div>
  );
}
