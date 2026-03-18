"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface FilterOption {
  readonly id: string;
  readonly name: string;
}

interface FilterBarProps {
  readonly categories: readonly FilterOption[];
}

export function FilterBar({ categories }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const activeCategory = searchParams.get("category");

  function handleFilter(categoryId: string | null) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (categoryId) {
        params.set("category", categoryId);
      } else {
        params.delete("category");
      }
      const qs = params.toString();
      router.push(qs ? `/spaces?${qs}` : "/spaces");
    });
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
          !activeCategory
            ? "bg-accent text-accent-foreground"
            : "bg-surface text-muted-foreground hover:text-foreground"
        }`}
      >
        すべて
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => handleFilter(cat.id)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            activeCategory === cat.id
              ? "bg-accent text-accent-foreground"
              : "bg-surface text-muted-foreground hover:text-foreground"
          }`}
        >
          {cat.name}
        </button>
      ))}
      {isPending ? (
        <span className="text-sm text-muted-foreground">読み込み中...</span>
      ) : null}
    </div>
  );
}
