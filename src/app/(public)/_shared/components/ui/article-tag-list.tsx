import type { ReactElement } from "react";

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
          <span className="border border-border px-3 py-1 text-xs text-muted-foreground">
            {tag.name}
          </span>
        </li>
      ))}
    </ul>
  );
}
