"use client";

import { useTransition, type ChangeEvent } from "react";
import { Tabs } from "radix-ui";
import { useQueryStates, debounce } from "nuqs";
import { cn } from "@/shared/lib/cn";
import { Select } from "@/public/components/design-system/select";
import {
  EVENT_LIST_TABS,
  eventsListSearchParamsParsers,
  isEventListTab,
  type EventListTab,
} from "@/public/lib/search-params";

export interface EventListFiltersCategory {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly color: string | null;
}

interface EventListFiltersProps {
  readonly categories: readonly EventListFiltersCategory[];
  readonly resultCount: number;
}

const TAB_LABELS: Record<EventListTab, string> = {
  upcoming: "開催予定",
  past: "終了",
};

const ALL_VALUE = "";

/**
 * 公開イベント一覧の検索性向上バー(タブ + 検索 + カテゴリー)。
 *
 * `/spaces` の FilterBar と異なり facet が 3 つのみのため Dialog は使わず
 * 常時表示の横並びバーにする。すべて nuqs `useQueryStates` で URL 同期し、
 * 任意 facet 変更で page=1 に戻す(結果セットが変わるため、`/spaces` FilterBar
 * と同じ house pattern)。
 */
export function EventListFilters({
  categories,
  resultCount,
}: EventListFiltersProps) {
  const [params, setParams] = useQueryStates(eventsListSearchParamsParsers, {
    history: "replace",
    shallow: false,
  });
  const [isPending, startTransition] = useTransition();

  function handleTabChange(value: string) {
    if (!isEventListTab(value)) return;
    startTransition(() => {
      void setParams({ tab: value, page: 1 });
    });
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    const next = { q: value, page: 1 };
    // クリア時は即時反映、入力中は 300ms デバウンス
    // (1 打鍵ごとのサーバー往復を抑止する公式推奨パターン。SearchBar と同型)。
    startTransition(() => {
      if (value === "") {
        void setParams(next);
      } else {
        void setParams(next, { limitUrlUpdates: debounce(300) });
      }
    });
  }

  function handleCategoryChange(event: ChangeEvent<HTMLSelectElement>) {
    startTransition(() => {
      void setParams({
        categoryId:
          event.target.value === ALL_VALUE ? null : event.target.value,
        page: 1,
      });
    });
  }

  const categoryOptions = [
    { value: ALL_VALUE, label: "すべてのカテゴリー" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-4 transition-opacity duration-300",
        isPending && "opacity-60",
      )}
    >
      <Tabs.Root value={params.tab} onValueChange={handleTabChange}>
        <Tabs.List
          aria-label="開催状況"
          className="flex border-b border-border"
        >
          {EVENT_LIST_TABS.map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className={cn(
                "group whitespace-nowrap px-4 py-2.5 text-sm tracking-[0.08em] outline-none transition-colors",
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
                {TAB_LABELS[tab]}
              </span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      <label className="flex min-h-11 min-w-[10rem] flex-1 flex-col gap-1 text-xs uppercase tracking-eyebrow text-muted-foreground">
        検索
        <input
          type="search"
          value={params.q}
          onChange={handleSearchChange}
          placeholder="イベントを検索"
          aria-label="イベントを検索"
          className="min-h-11 border-b border-border bg-transparent px-1 py-2 text-base tracking-wide text-foreground placeholder:text-muted-foreground focus-visible:border-accent focus-visible:outline-none"
        />
      </label>

      <Select
        label="カテゴリー"
        options={categoryOptions}
        value={params.categoryId ?? ALL_VALUE}
        onChange={handleCategoryChange}
        wrapperClassName="min-w-[10rem]"
      />

      <div className="text-sm text-muted-foreground" aria-live="polite">
        該当 <span className="font-medium text-foreground">{resultCount}</span>{" "}
        件
      </div>
    </div>
  );
}
