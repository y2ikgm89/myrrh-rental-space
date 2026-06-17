"use client";

import { useQueryStates } from "nuqs";
import {
  adminFaqReviewSearchParamsParsers,
  type AdminFaqReviewFilter,
} from "@/shared/lib/nuqs";
import { cn } from "@/shared/lib/cn";

const FILTER_TABS: readonly { value: AdminFaqReviewFilter; label: string }[] = [
  { value: "draft", label: "下書き" },
  { value: "stale", label: "未更新" },
  { value: "low-rated", label: "要改善" },
];

export function FaqReviewFilterTabs() {
  const [params, setParams] = useQueryStates(
    adminFaqReviewSearchParamsParsers,
    {
      history: "replace",
      shallow: false,
    },
  );

  return (
    <nav aria-label="レビュー対象の絞り込み">
      <ul className="inline-flex min-h-11 w-fit max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground scrollbar-hide">
        {FILTER_TABS.map(({ value, label }) => {
          const isActive = params.filter === value;
          return (
            <li key={value}>
              <button
                type="button"
                onClick={() => void setParams({ filter: value, page: null })}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ring-offset-background transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "hover:bg-background/50",
                  isActive && "bg-card text-foreground shadow-sm hover:bg-card",
                )}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
