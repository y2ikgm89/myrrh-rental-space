import type { ReactElement } from "react";
import Link from "next/link";
import type { SidebarTagItem } from "@/shared/domain/sidebar/queries";
import { buildTagPath } from "@/shared/domain/posts/routing";
import { toAppRoute } from "@/shared/lib/typed-routes";

interface SidebarTagsProps {
  tags: readonly SidebarTagItem[];
}

export function SidebarTags({ tags }: SidebarTagsProps): ReactElement {
  return (
    <div>
      <h2 className="mb-4 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        Tags
      </h2>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Link
            key={tag.id}
            href={toAppRoute(buildTagPath(tag.slug))}
            className="border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {tag.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
