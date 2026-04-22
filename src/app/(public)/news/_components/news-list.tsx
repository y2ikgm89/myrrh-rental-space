"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { ScrollRevealGroup } from "@/public/components/animations/scroll-reveal";
import { Heading } from "@/public/components/design-system/heading";
import { formatSerializedDate } from "@/shared/lib/serialize";

interface NewsItemData {
  id: string;
  slug: string;
  url: string;
  title: string;
  publishedAt: string | null;
}

interface NewsListProps {
  items: readonly NewsItemData[];
}

export function NewsList({ items }: NewsListProps): ReactElement {
  if (items.length === 0) {
    return (
      <div className="py-[var(--space-lg)] text-center">
        <p className="text-muted-foreground">お知らせはまだありません。</p>
      </div>
    );
  }

  return (
    <ScrollRevealGroup className="divide-y border-y border-border divide-border">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.url}
          className="group flex items-baseline gap-4 py-5 transition-colors hover:bg-accent/30 md:gap-6 md:py-6"
        >
          <time
            dateTime={item.publishedAt ?? undefined}
            className="shrink-0 text-xs text-muted-foreground md:text-sm"
          >
            {formatSerializedDate(item.publishedAt)}
          </time>

          <Heading
            level={2}
            className="!text-sm font-medium transition-colors group-hover:text-foreground md:!text-base"
          >
            {item.title}
          </Heading>
        </Link>
      ))}
    </ScrollRevealGroup>
  );
}
