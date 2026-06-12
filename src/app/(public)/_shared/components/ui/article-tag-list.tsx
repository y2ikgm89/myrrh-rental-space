import type { ReactElement } from "react";
import Link from "next/link";
import { buildTagPath } from "@/shared/domain/posts/routing";
import { toAppRoute } from "@/shared/lib/typed-routes";

export interface ArticleTag {
  readonly slug: string;
  readonly name: string;
}

export function ArticleTagList({
  tags,
}: {
  readonly tags: readonly ArticleTag[];
}): ReactElement {
  return (
    <ul aria-label="タグ" className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag.slug}>
          <Link
            href={toAppRoute(buildTagPath(tag.slug))}
            className="border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {tag.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
