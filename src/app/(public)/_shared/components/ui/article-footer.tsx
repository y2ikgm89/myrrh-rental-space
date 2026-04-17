import type { ReactElement } from "react";
import { ArticleTagList, type ArticleTag } from "./article-tag-list";
import { ShareButtons } from "./share-buttons";

export interface ArticleFooterProps {
  readonly url: string;
  readonly title: string;
  readonly tags?: readonly ArticleTag[];
}

export function ArticleFooter({
  url,
  title,
  tags,
}: ArticleFooterProps): ReactElement {
  const hasTags = tags !== undefined && tags.length > 0;
  return (
    <footer>
      {hasTags ? (
        <div className="mt-12 border-y border-border py-6">
          <ArticleTagList tags={tags} />
        </div>
      ) : null}
      <div className={hasTags ? "mt-12" : "mt-12 border-t border-border pt-8"}>
        <ShareButtons url={url} title={title} />
      </div>
    </footer>
  );
}
