"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { parseAsString, parseAsInteger, useQueryStates } from "nuqs";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Heading } from "@/public/components/design-system/heading";
import { formatSerializedDate } from "@/shared/lib/serialize";

interface JournalItem {
  readonly id: string;
  readonly type: "news" | "post";
  readonly title: string;
  readonly url: string;
  readonly publishedAt: string | null;
}

interface JournalContentProps {
  readonly items: readonly JournalItem[];
  readonly activeTab: string;
}

const TABS = [
  { value: "all", label: "すべて" },
  { value: "news", label: "ニュース" },
  { value: "posts", label: "コラム" },
] as const;

const tabParsers = {
  tab: parseAsString.withDefault("all"),
  page: parseAsInteger.withDefault(1),
};

function TypeBadge({ type }: { readonly type: "news" | "post" }): ReactElement {
  const label = type === "news" ? "ニュース" : "コラム";

  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em]r text-muted-foreground">
      {label}
    </span>
  );
}

export function JournalContent({
  items,
  activeTab,
}: JournalContentProps): ReactElement {
  const [, setParams] = useQueryStates(tabParsers, {
    history: "push",
    shallow: false,
  });

  function handleTabChange(value: string) {
    void setParams({ tab: value === "all" ? null : value, page: 1 });
  }

  return (
    <div>
      {/* Tab navigation */}
      <nav aria-label="コンテンツフィルター" className="mb-10">
        <ul className="flex gap-1 border-b border-border" role="tablist">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.value;
            return (
              <li key={tab.value} role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleTabChange(tab.value)}
                  className={`px-5 py-3 text-sm tracking-[0.18em] transition-colors ${
                    isActive
                      ? "border-b-2 border-accent text-accent"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Feed list */}
      {items.length === 0 ? (
        <div className="py-[var(--spacing-section)] text-center">
          <p className="text-muted-foreground">記事はまだありません。</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item, index) => (
            <li key={item.id}>
              <ScrollReveal delay={0.08 * Math.min(index, 8)}>
                <Link
                  href={item.url}
                  className="group flex items-center gap-4 py-5 transition-colors hover:bg-accent/30 md:gap-6 md:py-6"
                >
                  <time
                    dateTime={item.publishedAt ?? undefined}
                    className="shrink-0 text-xs text-muted-foreground md:text-sm"
                  >
                    {formatSerializedDate(item.publishedAt)}
                  </time>

                  <TypeBadge type={item.type} />

                  <Heading
                    level={2}
                    className="!text-sm font-medium transition-colors group-hover:text-foreground md:!text-base"
                  >
                    {item.title}
                  </Heading>
                </Link>
              </ScrollReveal>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
