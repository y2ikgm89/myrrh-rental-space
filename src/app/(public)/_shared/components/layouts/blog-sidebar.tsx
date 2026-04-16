import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import { SidebarSearch } from "@/public/components/sidebar/sidebar-search";
import { SidebarRecentPosts } from "@/public/components/sidebar/sidebar-recent-posts";
import { SidebarPopularPosts } from "@/public/components/sidebar/sidebar-popular-posts";
import { SidebarCategories } from "@/public/components/sidebar/sidebar-categories";
import { SidebarTags } from "@/public/components/sidebar/sidebar-tags";
import { SidebarCustom } from "@/public/components/sidebar/sidebar-custom";
import type { SidebarData } from "@/shared/domain/sidebar/queries";
import type { SidebarWidget } from "@/shared/lib/validations/sidebar";

interface BlogSidebarProps {
  readonly widgets: readonly SidebarWidget[];
  readonly data: SidebarData;
}

function renderWidget(
  widget: SidebarWidget,
  data: SidebarData,
): ReactElement | null {
  switch (widget.type) {
    case "search":
      return <SidebarSearch />;
    case "recent":
      return <SidebarRecentPosts posts={data.recentPosts} />;
    case "popular":
      return <SidebarPopularPosts posts={data.popularPosts} />;
    case "categories":
      return <SidebarCategories categories={data.categories} />;
    case "tags":
      return <SidebarTags tags={data.tags} />;
    case "custom":
      return <SidebarCustom widget={widget} />;
    default:
      return null;
  }
}

function getWidgetKey(widget: SidebarWidget): string {
  return widget.type === "custom" ? `custom:${widget.id}` : widget.type;
}

export function BlogSidebar({ widgets, data }: BlogSidebarProps): ReactElement {
  const enabledWidgets = widgets.filter((w) => w.enabled);

  return (
    <aside aria-label="ブログサイドバー" className="hidden lg:block">
      <div className="sticky top-[calc(var(--header-height)+2rem)]">
        {enabledWidgets.map((widget, index) => (
          <div
            key={getWidgetKey(widget)}
            className={cn(index > 0 && "mt-8 border-t border-border pt-8")}
          >
            {renderWidget(widget, data)}
          </div>
        ))}
      </div>
    </aside>
  );
}
