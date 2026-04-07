import type { ReactElement } from "react";
import { SidebarSearch } from "@/public/components/sidebar/sidebar-search";
import { SidebarRecentPosts } from "@/public/components/sidebar/sidebar-recent-posts";
import { SidebarPopularPosts } from "@/public/components/sidebar/sidebar-popular-posts";
import { SidebarCategories } from "@/public/components/sidebar/sidebar-categories";
import { SidebarTags } from "@/public/components/sidebar/sidebar-tags";
import { SidebarCustom } from "@/public/components/sidebar/sidebar-custom";
import type { SidebarData } from "@/shared/domain/sidebar/queries";
import type {
  SidebarWidget,
  CustomWidget,
} from "@/shared/lib/validations/sidebar";

interface BlogSidebarProps {
  widgets: SidebarWidget[];
  data: SidebarData;
}

function getWidgetKey(widget: SidebarWidget): string {
  if (widget.type === "custom") return widget.id;
  return widget.type;
}

export function BlogSidebar({ widgets, data }: BlogSidebarProps): ReactElement {
  const enabledWidgets = widgets.filter((w) => w.enabled);

  return (
    <aside className="hidden space-y-8 lg:block" aria-label="ブログサイドバー">
      <div className="sticky top-[calc(var(--header-height)+2rem)]">
        <div className="space-y-8">
          {enabledWidgets.map((widget) => {
            const key = getWidgetKey(widget);
            switch (widget.type) {
              case "search":
                return <SidebarSearch key={key} />;
              case "recent":
                return (
                  <SidebarRecentPosts key={key} posts={data.recentPosts} />
                );
              case "popular":
                return (
                  <SidebarPopularPosts key={key} posts={data.popularPosts} />
                );
              case "categories":
                return (
                  <SidebarCategories key={key} categories={data.categories} />
                );
              case "tags":
                return <SidebarTags key={key} tags={data.tags} />;
              case "custom": {
                const customWidget: CustomWidget = widget;
                return <SidebarCustom key={key} widget={customWidget} />;
              }
              default:
                return null;
            }
          })}
        </div>
      </div>
    </aside>
  );
}
