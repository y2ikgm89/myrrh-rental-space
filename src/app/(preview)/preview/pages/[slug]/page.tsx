import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPageForEdit } from "@/admin/queries/page-section";
import { HomepageSections } from "@/public/components/homepage/HomepageSections";
import { ManagedPageSections } from "@/public/components/pages/ManagedPageSections";
import { PreviewBanner } from "@/public/components/ui/preview-banner";
import { getPublicSettingsForStyle } from "@/shared/domain/settings/queries/display";

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
