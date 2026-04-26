"use client";

import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { cn } from "@/shared/lib/cn";
import { ReservationList } from "./reservation-list";
import type { ReservationListItem } from "./reservation-list";

interface ReservationTabsProps {
  readonly activeItems: readonly ReservationListItem[];
  readonly pastItems: readonly ReservationListItem[];
}

const TAB_VALUES = ["active", "past"] as const;
type TabValue = (typeof TAB_VALUES)[number];
const TAB_VALUE_SET = new Set<string>(TAB_VALUES);
function isTabValue(value: string): value is TabValue {
  return TAB_VALUE_SET.has(value);
}

const TAB_TRIGGER_CLASS = cn(
  "min-h-11 whitespace-nowrap px-5 py-3 text-base tracking-[0.12em] transition-colors",
  "underline decoration-2 underline-offset-[6px]",
  "text-muted-foreground decoration-transparent hover:text-foreground",
  "data-[state=active]:text-accent data-[state=active]:decoration-accent",
);

export function ReservationTabs({
  activeItems,
  pastItems,
}: ReservationTabsProps) {
  const [tab, setTab] = useState<TabValue>(
    activeItems.length > 0 ? "active" : "past",
  );

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(v) => {
        if (isTabValue(v)) setTab(v);
      }}
    >
      <Tabs.List
        aria-label="予約一覧の表示切替"
        className="mb-6 flex justify-center border-b border-border"
      >
        <Tabs.Trigger value="active" className={TAB_TRIGGER_CLASS}>
          これから（{activeItems.length}）
        </Tabs.Trigger>
        <Tabs.Trigger value="past" className={TAB_TRIGGER_CLASS}>
          過去（{pastItems.length}）
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content
        value="active"
        forceMount
        className="outline-none data-[state=inactive]:hidden"
      >
        <ReservationList items={activeItems} />
      </Tabs.Content>
      <Tabs.Content
        value="past"
        forceMount
        className="outline-none data-[state=inactive]:hidden"
      >
        <ReservationList items={pastItems} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
