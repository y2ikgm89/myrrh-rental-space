"use client";

import type { ReactNode } from "react";
import { useQueryStates } from "nuqs";
import { cn } from "@/shared/lib/cn";
import { eventsSearchParamsParsers } from "@/public/lib/search-params";

const VIEW_TABS = [
  { value: "list", label: "一覧" },
  { value: "calendar", label: "カレンダー" },
] as const;

type ViewType = (typeof VIEW_TABS)[number]["value"];

interface EventsViewSwitcherProps {
  readonly activeView: ViewType;
  readonly listView: ReactNode;
  readonly calendarView: ReactNode;
}

export function EventsViewSwitcher({
  activeView,
  listView,
  calendarView,
}: EventsViewSwitcherProps) {
  const [, setParams] = useQueryStates(eventsSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  function handleViewChange(view: ViewType) {
    void setParams({ view: view === "list" ? null : view });
  }

  return (
    <div>
      <nav aria-label="表示切替" className="mb-10 md:mb-14">
        <ul className="flex gap-1 border-b border-border" role="tablist">
          {VIEW_TABS.map((tab) => {
            const isActive = activeView === tab.value;
            return (
              <li key={tab.value} role="presentation">
                <button
                  type="button"
                  role="tab"
                  id={`events-tab-${tab.value}`}
                  aria-selected={isActive}
                  aria-controls={`events-panel-${tab.value}`}
                  onClick={() => handleViewChange(tab.value)}
                  className={cn(
                    "px-5 py-3 text-sm tracking-[0.18em] transition-colors",
                    isActive
                      ? "border-b-2 border-accent text-accent"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        id="events-panel-list"
        role="tabpanel"
        aria-labelledby="events-tab-list"
        className={activeView !== "list" ? "hidden" : undefined}
      >
        {listView}
      </div>
      <div
        id="events-panel-calendar"
        role="tabpanel"
        aria-labelledby="events-tab-calendar"
        className={activeView !== "calendar" ? "hidden" : undefined}
      >
        {calendarView}
      </div>
    </div>
  );
}
