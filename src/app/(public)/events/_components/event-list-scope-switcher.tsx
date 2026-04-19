"use client";

import type { ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { useQueryStates } from "nuqs";
import { cn } from "@/shared/lib/cn";
import {
  eventsSearchParamsParsers,
  isEventScope,
  type EventScope,
} from "@/public/lib/search-params";

const SCOPE_TABS: readonly {
  readonly value: EventScope;
  readonly label: string;
}[] = [
  { value: "upcoming", label: "今後のイベント" },
  { value: "past", label: "過去のイベント" },
];

interface EventListScopeSwitcherProps {
  readonly activeScope: EventScope;
  readonly upcomingView: ReactNode;
  readonly pastView: ReactNode;
}

export function EventListScopeSwitcher({
  activeScope,
  upcomingView,
  pastView,
}: EventListScopeSwitcherProps) {
  const [, setParams] = useQueryStates(eventsSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  function handleValueChange(value: string) {
    if (!isEventScope(value)) return;
    void setParams({ scope: value });
  }

  return (
    <Tabs.Root
      value={activeScope}
      onValueChange={handleValueChange}
      activationMode="automatic"
    >
      <div className="mb-8 flex justify-center md:mb-10">
        <Tabs.List
          aria-label="イベント期間切替"
          className="flex border-b border-border"
        >
          {SCOPE_TABS.map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className={cn(
                "group whitespace-nowrap px-5 py-3 text-sm tracking-[0.12em] outline-none transition-colors",
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
        value="upcoming"
        forceMount
        className="outline-none data-[state=inactive]:hidden"
      >
        {upcomingView}
      </Tabs.Content>
      <Tabs.Content
        value="past"
        forceMount
        className="outline-none data-[state=inactive]:hidden"
      >
        {pastView}
      </Tabs.Content>
    </Tabs.Root>
  );
}
