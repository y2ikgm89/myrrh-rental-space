import type { ReactElement } from "react";
import { Heading } from "../design-system/heading";
import { ImageFrame } from "../design-system/image-frame";
import { formatSerializedDate, toISOString } from "@/shared/lib/serialize";

interface ArticleHeaderProps {
  readonly title: string;
  readonly publishedAt: string | Date | null;
  readonly category?: string | null;
  readonly author?: string | null;
  readonly thumbnail?: { readonly url: string; readonly alt: string } | null;
}

/**
 * ArticleHeader — 公開記事詳細ページ共通ヘッダー
 *
 * `<header>` に title (h1) + meta (category / date / author) + optional thumbnail
 * を集約。ArticleLayout 内の `<article>` 直下に配置する。
 */
export function ArticleHeader({
  title,
  publishedAt,
  category,
  author,
  thumbnail,
}: ArticleHeaderProps): ReactElement {
  const isoDate = toISOString(publishedAt);
  const showCategoryDivider = Boolean(category && (publishedAt || author));
  const showAuthorDivider = Boolean(author && publishedAt);

  return (
    <header className="mb-12 space-y-8">
      <div className="space-y-6">
        <Heading level={1}>{title}</Heading>
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          {category ? (
            <span className="text-[0.7rem] uppercase tracking-[0.18em] text-accent">
              {category}
            </span>
          ) : null}
          {showCategoryDivider ? (
            <span aria-hidden="true" className="text-border">
              ·
            </span>
          ) : null}
          {publishedAt ? (
            <time
              dateTime={isoDate ?? undefined}
              className="font-heading text-sm font-light"
            >
              {formatSerializedDate(isoDate)}
            </time>
          ) : null}
          {showAuthorDivider ? (
            <span aria-hidden="true" className="text-border">
              ·
            </span>
          ) : null}
          {author ? <span className="text-sm">{author}</span> : null}
        </div>
      </div>
      {thumbnail ? (
        <ImageFrame
          src={thumbnail.url}
          alt={thumbnail.alt}
          aspect="video"
          fill
          sizes="(min-width: 1024px) 60vw, 100vw"
          rounded
        />
      ) : null}
    </header>
  );
}
