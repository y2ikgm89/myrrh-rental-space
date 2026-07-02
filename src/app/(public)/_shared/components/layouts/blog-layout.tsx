import type { ReactElement, ReactNode } from "react";
import { connection } from "next/server";
import { getSidebarSettings } from "@/shared/domain/settings/queries/sidebar";
import { getSidebarData } from "@/shared/domain/sidebar/queries";
import { BlogSidebar } from "@/public/components/layouts/blog-sidebar";

interface BlogLayoutProps {
  children: ReactNode;
  /**
   * Component-level explicit disable. ArticleLayout / terms ページなどで
   * sidebar 非表示にする用途専用。
   * 未指定時は `Settings.sidebarEnabled` (global) に従う。
   */
  showSidebar?: boolean;
}

export async function BlogLayout({
  children,
  showSidebar,
}: BlogLayoutProps): Promise<ReactElement> {
  // Fast path: explicit disable skips the settings fetch entirely.
  if (showSidebar === false) {
    return <>{children}</>;
  }

  await connection();

  const settings = await getSidebarSettings();
  if (!settings.enabled) {
    return <>{children}</>;
  }

  const data = await getSidebarData(
    settings.widgets,
    settings.recentCount,
    settings.popularCount,
  );

  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-12">
      <div>{children}</div>
      <BlogSidebar widgets={settings.widgets} data={data} />
    </div>
  );
}
