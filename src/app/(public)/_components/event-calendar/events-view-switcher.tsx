"use client";

import type { ReactNode } from "react";
import { Tabs } from "radix-ui";
import { useQueryStates } from "nuqs";
import { cn } from "@/shared/lib/cn";
import {
  eventsSearchParamsParsers,
  isEventView,
  type EventView,
} from "@/public/lib/search-params";

const VIEW_TABS: readonly {
  readonly value: EventView;
  readonly label: string;
}[] = [
  { value: "list", label: "一覧" },
  { value: "calendar", label: "カレンダー" },
];

interface EventsViewSwitcherProps {
  readonly listView: ReactNode;
  readonly calendarView: ReactNode;
}

export function EventsViewSwitcher({
  listView,
  calendarView,
}: EventsViewSwitcherProps) {
  const [{ view }, setParams] = useQueryStates(eventsSearchParamsParsers, {
    history: "push",
    shallow: true,
  });

  function handleValueChange(value: string) {
    if (!isEventView(value)) return;
    void setParams({ view: value });
  }

  return (
    <Tabs.Root
      value={view}
      onValueChange={handleValueChange}
      activationMode="automatic"
    >
      <div className="mb-10 flex justify-center md:mb-14">
        <Tabs.List
          aria-label="表示切替"
          className="flex border-b border-border"
        >
          {VIEW_TABS.map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className={cn(
                "group whitespace-nowrap px-5 py-3 text-base tracking-[0.12em] outline-none transition-colors",
                "text-muted-foreground hover:text-foreground",
                "data-[state=active]:text-accent",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            >
              <span
                className={cn(
                  "underline decoration-2 underline-offset-[6px] transition-colors",
                  "decoration-transparent group-data-[state=active]:decoration-accent",
                )}
              >
                {tab.label}
              </span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </div>

      <Tabs.Content
        value="list"
        forceMount
        className="outline-none data-[state=inactive]:hidden"
      >
        {listView}
      </Tabs.Content>
      <Tabs.Content
        value="calendar"
        forceMount
        className="outline-none data-[state=inactive]:hidden"
      >
        {calendarView}
      </Tabs.Content>
    </Tabs.Root>
  );
}
