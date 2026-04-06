import type { ReactElement } from "react";
import Link from "next/link";
import { formatSerializedDate } from "@/shared/lib/serialize";
import type { SidebarPostItem } from "@/shared/domain/sidebar/queries";

interface SidebarPopularPostsProps {
  posts: readonly SidebarPostItem[];
}

export function SidebarPopularPosts({
  posts,
}: SidebarPopularPostsProps): ReactElement {
  return (
    <div>
      <h3 className="mb-4 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        Popular
      </h3>
      <ul className="space-y-4">
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              href={post.url}
              className="group block text-sm transition-colors hover:text-foreground"
            >
              <span className="line-clamp-2">{post.title}</span>
              <time className="mt-1 block text-xs text-muted-foreground">
                {formatSerializedDate(post.publishedAt)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
