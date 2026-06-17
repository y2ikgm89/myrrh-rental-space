"use client";

import { useQueryState } from "nuqs";
import type { ReactNode } from "react";
import type { AdminSpaceManagementTab } from "@/shared/lib/constants";
import { adminSpaceSearchParamsParsers } from "@/shared/lib/nuqs";
import { cn } from "@/shared/lib/cn";

const TAB_BASE: readonly { value: AdminSpaceManagementTab; label: string }[] = [
  { value: "spaces", label: "スペース" },
  { value: "locations", label: "場所" },
  { value: "categories", label: "カテゴリー" },
  { value: "reviews", label: "レビュー" },
];

interface SpaceManagementTabsProps {
  children: ReactNode;
}

export function SpaceManagementTabs({ children }: SpaceManagementTabsProps) {
  const [tab, setTab] = useQueryState(
    "tab",
    adminSpaceSearchParamsParsers.tab.withOptions({
      history: "replace",
      shallow: false,
    }),
  );

  return (
    <div className="w-full">
      <nav aria-label="スペース管理ナビゲーション" className="mb-2">
        <ul className="inline-flex min-h-11 w-fit max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground scrollbar-hide">
          {TAB_BASE.map(({ value, label }) => {
            const isActive = tab === value;
            return (
              <li key={value}>
                <button
                  type="button"
                  onClick={() => void setTab(value)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ring-offset-background transition-all duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "hover:bg-background/50",
                    isActive &&
                      "bg-card text-foreground shadow-sm hover:bg-card",
                  )}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div>{children}</div>
    </div>
  );
}
