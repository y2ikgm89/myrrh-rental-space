"use client";

import { useQueryStates } from "nuqs";
import {
  adminEventSearchParamsParsers,
  type EventTabFilter,
} from "@/shared/lib/nuqs";
import { cn } from "@/shared/lib/cn";
import { EVENT_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";

const TAB_BASE: readonly { value: EventTabFilter; label: string }[] = [
  { value: "open", label: "開催" },
  { value: "past", label: "終了" },
  { value: "draft", label: EVENT_STATUS_LABELS[EventStatus.DRAFT] },
  { value: "cancelled", label: EVENT_STATUS_LABELS[EventStatus.CANCELLED] },
  { value: "all", label: "すべて" },
];

export function EventTabs() {
  const [params, setParams] = useQueryStates(adminEventSearchParamsParsers, {
    history: "replace",
    shallow: false,
  });

  return (
    <nav aria-label="イベント分類">
      <ul className="inline-flex min-h-11 w-fit max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground scrollbar-hide">
        {TAB_BASE.map(({ value, label }) => {
          const isActive = params.tab === value;
          return (
            <li key={value}>
              <button
                type="button"
                onClick={() =>
                  void setParams({
                    tab: value,
                    page: null,
                    sortBy: null,
                    sortOrder: null,
                    status: null,
                  })
                }
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
