import type { ReactElement } from "react";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import { ImageFrame } from "@/public/components/design-system/image-frame";
import { formatSerializedDate } from "@/shared/lib/serialize";
import type { SidebarPostItem } from "@/shared/domain/sidebar/queries";
import type { PostListLayout } from "@/shared/lib/validations/sidebar";

interface SidebarPostListProps {
  label: string;
  posts: readonly SidebarPostItem[];
  layout: PostListLayout;
  showRanking?: boolean;
}

export function SidebarPostList({
  label,
  posts,
  layout,
  showRanking = false,
}: SidebarPostListProps): ReactElement {
  const isStacked = layout === "stacked";

  return (
    <div>
      <h3 className="mb-4 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </h3>
      <ul className={isStacked ? "space-y-7" : "space-y-5"}>
        {posts.map((post, index) => (
          <li key={post.id}>
            <Link
              href={post.url}
              className={cn(
                "group transition-colors hover:text-foreground",
                isStacked
                  ? "flex flex-col gap-2"
                  : "grid grid-cols-[96px_1fr] gap-3",
              )}
            >
              <ThumbnailBlock
                post={post}
                layout={layout}
                rank={showRanking ? index + 1 : undefined}
              />
              <MetaBlock post={post} layout={layout} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ThumbnailBlockProps {
  post: SidebarPostItem;
  layout: PostListLayout;
  rank: number | undefined;
}

function ThumbnailBlock({
  post,
  layout,
  rank,
}: ThumbnailBlockProps): ReactElement {
  const isStacked = layout === "stacked";
  const sizes = isStacked ? "(min-width: 1024px) 320px, 100vw" : "96px";

  return (
    <div className="relative">
      {post.thumbnailUrl ? (
        <ImageFrame
          src={post.thumbnailUrl}
          alt=""
          fill
          aspect="photo"
          sizes={sizes}
        />
      ) : (
        <div aria-hidden="true" className="aspect-[3/2] w-full bg-surface" />
      )}
      {rank !== undefined ? <RankBadge rank={rank} /> : null}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="absolute left-0 top-0 inline-flex min-w-[1.75rem] items-center justify-center bg-accent/85 px-1.5 py-0.5 font-heading text-xs font-light italic leading-none tabular-nums text-accent-foreground"
    >
      {String(rank).padStart(2, "0")}
    </span>
  );
}

interface MetaBlockProps {
  post: SidebarPostItem;
  layout: PostListLayout;
}

function MetaBlock({ post, layout }: MetaBlockProps): ReactElement {
  const isStacked = layout === "stacked";

  return (
    <div className={cn(isStacked ? undefined : "min-w-0")}>
      <div className="mb-1 flex items-center gap-1 text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
        {post.category ? (
          <>
            <span className="truncate">{post.category.name}</span>
            <span aria-hidden="true">·</span>
          </>
        ) : null}
        <time {...(post.publishedAt && { dateTime: post.publishedAt })}>
          {formatSerializedDate(post.publishedAt)}
        </time>
      </div>
      <span
        className={cn(
          "line-clamp-2 leading-snug",
          isStacked ? "text-base" : "text-sm",
        )}
      >
        {post.title}
      </span>
    </div>
  );
}
