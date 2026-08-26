"use client";

import { useTransition, type ChangeEvent } from "react";
import { useQueryStates, debounce } from "nuqs";
import { useAdoptPrehydrationInput } from "@/shared/hooks/use-adopt-prehydration-input";
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

  function commitSearch(value: string) {
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

  // 水和前に打たれた文字は onChange に届かない。理由と機序は hook の JSDoc。
  const searchRef = useAdoptPrehydrationInput<HTMLInputElement>(
    params.q,
    commitSearch,
  );

  function commitCategory(value: string) {
    startTransition(() => {
      void setParams({
        categoryId: value === ALL_VALUE ? null : value,
        page: 1,
      });
    });
  }

  // 水和前に選ばれた option も同じく onChange に届かない。ただし `<select>` の
  // 機序は input と別で、react-dom 19.2.8 の水和経路（`case "select"`）は
  // `initInput` も `track()` も呼ばない。tracker に封じ込められる代わりに、
  // 次の再レンダーで `updateOptions` が props 側の値を DOM へ書き戻すので
  // 「選んだはずの絞り込みが無言で元に戻る」形になる。突き合わせる処置は同じ。
  const categoryRef = useAdoptPrehydrationInput<HTMLSelectElement>(
    params.categoryId ?? ALL_VALUE,
    commitCategory,
  );

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
      {/*
        タブ「風」の見た目だが tabpanel は存在しない（結果一覧はこのバーの外側で
        サーバーレンダリングされ、選択は URL クエリで表現される）。Radix の
        `Tabs.Trigger` は必ず `aria-controls="<id>-content-<value>"` を出力するため、
        `Tabs.Content` を持たないここで使うと参照先の無い aria-controls になり
        axe の `aria-valid-attr-value`（critical / WCAG 4.1.2）に該当する。
        検索欄・カテゴリー select と並ぶ facet の 1 つなので、押下状態を持つ
        トグルボタン群として表現する。
      */}
      <div
        role="group"
        aria-label="開催状況"
        className="flex border-b border-border"
      >
        {EVENT_LIST_TABS.map((tab) => {
          const isActive = params.tab === tab;
          return (
            <button
              key={tab}
              type="button"
              aria-pressed={isActive}
              data-state={isActive ? "active" : "inactive"}
              onClick={() => {
                handleTabChange(tab);
              }}
              className={cn(
                // タブ内部の padding は viewport 端の safe-area と無関係なので
                // container-padding token は使わず、px-4 と同値の arbitrary value で表現
                "group whitespace-nowrap px-[1rem] py-2.5 text-sm tracking-[0.08em] outline-none transition-colors",
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
            </button>
          );
        })}
      </div>

      <label className="flex min-h-11 min-w-[10rem] flex-1 flex-col gap-1 text-xs uppercase tracking-eyebrow text-muted-foreground">
        検索
        <input
          ref={searchRef}
          type="search"
          value={params.q}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            commitSearch(event.target.value);
          }}
          placeholder="イベントを検索"
          aria-label="イベントを検索"
          className="min-h-11 border-b border-border bg-transparent px-1 py-2 text-base tracking-wide text-foreground placeholder:text-muted-foreground focus-visible:border-accent focus-visible:outline-none"
        />
      </label>

      <Select
        ref={categoryRef}
        label="カテゴリー"
        options={categoryOptions}
        value={params.categoryId ?? ALL_VALUE}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
          commitCategory(event.target.value);
        }}
        wrapperClassName="min-w-[10rem]"
      />

      <div className="text-sm text-muted-foreground" aria-live="polite">
        該当 <span className="font-medium text-foreground">{resultCount}</span>{" "}
        件
      </div>
    </div>
  );
}
