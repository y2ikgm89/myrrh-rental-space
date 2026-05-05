"use client";

import type { ReactElement } from "react";
import { useQueryStates } from "nuqs";
import { useTransition } from "react";
import { cn } from "@/shared/lib/cn";
import { postsSearchParamsParsers } from "@/public/lib/search-params";

interface CategoryOption {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

interface PostCategoryFilterProps {
  readonly categories: readonly CategoryOption[];
}

export function PostCategoryFilter({
  categories,
}: PostCategoryFilterProps): ReactElement {
  const [params, setParams] = useQueryStates(postsSearchParamsParsers, {
    history: "push",
    shallow: false,
  });
  const [isPending, startTransition] = useTransition();

  const activeCategory = params.category;

  function handleFilter(categorySlug: string | null) {
    startTransition(() => {
      void setParams({ category: categorySlug ?? "", page: 1 });
    });
  }

  return (
    <nav
      aria-label="カテゴリフィルタ"
      className={cn(
        "mb-8 transition-opacity duration-300",
        isPending && "opacity-60",
      )}
    >
      <ul className="flex flex-wrap gap-3" role="list">
        <li>
          <button
            type="button"
            onClick={() => handleFilter(null)}
            aria-pressed={!activeCategory}
            className={cn(
              "px-5 py-2 text-[0.65rem] uppercase tracking-[0.18em] transition-all duration-300",
              !activeCategory
                ? "bg-accent text-accent-foreground"
                : "border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30",
            )}
          >
            All
          </button>
        </li>
        {categories.map((cat) => (
          <li key={cat.id}>
            <button
              type="button"
              onClick={() => handleFilter(cat.slug)}
              aria-pressed={activeCategory === cat.slug}
              className={cn(
                "px-5 py-2 text-[0.65rem] uppercase tracking-[0.18em] transition-all duration-300",
                activeCategory === cat.slug
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30",
              )}
            >
              {cat.name}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
