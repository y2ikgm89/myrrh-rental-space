"use client";

import type { ReactElement } from "react";
import { parseAsString, parseAsInteger, useQueryStates } from "nuqs";

interface CategoryOption {
  readonly slug: string;
  readonly name: string;
}

interface CategoryFilterProps {
  readonly categories: readonly CategoryOption[];
}

const categoryParsers = {
  category: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
};

export function CategoryFilter({
  categories,
}: CategoryFilterProps): ReactElement {
  const [params, setParams] = useQueryStates(categoryParsers, {
    history: "push",
    shallow: false,
  });

  function handleFilter(slug: string | null) {
    void setParams({ category: slug, page: 1 });
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="カテゴリフィルタ"
    >
      <button
        type="button"
        onClick={() => handleFilter(null)}
        className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          !params.category
            ? "bg-accent text-accent-foreground"
            : "bg-surface text-muted-foreground hover:text-foreground"
        }`}
      >
        すべて
      </button>
      {categories.map((cat) => (
        <button
          key={cat.slug}
          type="button"
          onClick={() => handleFilter(cat.slug)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            params.category === cat.slug
              ? "bg-accent text-accent-foreground"
              : "bg-surface text-muted-foreground hover:text-foreground"
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
