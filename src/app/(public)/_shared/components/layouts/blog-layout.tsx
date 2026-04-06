import type { ReactElement, ReactNode } from "react";
import { getSidebarSettings } from "@/shared/domain/settings/queries/sidebar";
import { getSidebarData } from "@/shared/domain/sidebar/queries";
import { BlogSidebar } from "@/public/components/layouts/blog-sidebar";

interface BlogLayoutProps {
  children: ReactNode;
  /** Page.showSidebar override: null=use global, true/false=explicit */
  showSidebar?: boolean | null;
}

export async function BlogLayout({
  children,
  showSidebar,
}: BlogLayoutProps): Promise<ReactElement> {
  const settings = await getSidebarSettings();

  const sidebarEnabled = showSidebar != null ? showSidebar : settings.enabled;

  if (!sidebarEnabled) {
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
