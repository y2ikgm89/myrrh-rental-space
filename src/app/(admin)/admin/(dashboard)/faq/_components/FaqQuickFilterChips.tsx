"use client";

import { useTransition } from "react";
import { useQueryStates } from "nuqs";
import { adminFaqSearchParamsParsers } from "@/shared/lib/nuqs";
import { cn } from "@/shared/lib/cn";

const QUICK_FILTERS = [
  { value: "all", label: "すべて" },
  { value: "drafts", label: "下書きのみ" },
  { value: "recent", label: "最近更新 (7日)" },
  { value: "stale", label: "30日以上未更新" },
] as const satisfies readonly {
  value: "all" | "drafts" | "recent" | "stale";
  label: string;
}[];

export function FaqQuickFilterChips() {
  const [, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(adminFaqSearchParamsParsers, {
    history: "push",
    shallow: false,
    startTransition,
  });

  return (
    <div
      role="toolbar"
      aria-label="クイックフィルタ"
      className="flex flex-wrap gap-2"
    >
      {QUICK_FILTERS.map((filter) => {
        const isActive = params.quickFilter === filter.value;
        return (
          <button
            key={filter.value}
            type="button"
            onClick={() =>
              void setParams({ quickFilter: filter.value, page: 1 })
            }
            aria-pressed={isActive}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
