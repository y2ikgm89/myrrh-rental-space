"use client";

import { useTransition, type ChangeEvent, type ReactNode } from "react";
import Link, { useLinkStatus } from "next/link";
import { useQueryStates, createSerializer, debounce } from "nuqs";
import { useAdoptPrehydrationInput } from "@/shared/hooks/use-adopt-prehydration-input";
import { cn } from "@/shared/lib/cn";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { Select } from "@/public/components/design-system/select";
import {
  EVENT_LIST_TABS,
  eventsListSearchParamsParsers,
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
 * タブの href を現在の facet ごと組み立てる（nuqs 公式の serializer）。
 *
 * base に `/events` を渡して絶対パスにする。`typedRoutes: true` なので
 * 動的に組んだ文字列はそのままでは `Route` に入らず、境界は SSoT の
 * `toAppRoute`（`@/shared/lib/typed-routes`）1 本に通す。
 */
const EVENTS_PATH = "/events";
const serializeEventsListParams = createSerializer(
  eventsListSearchParamsParsers,
);

/**
 * `<Link>` 自身の遷移中だけ淡くする。
 *
 * 検索欄・カテゴリーは `useTransition` で束ねてバー全体を淡くしているが、
 * タブは `setParams` ではなく実リンクの遷移なのでその pending には乗らない。
 * `useLinkStatus` は **`<Link>` の子孫でしか使えない**（Next 公式）ので、
 * この小さな子コンポーネントに切り出している。
 */
function TabLabel({ children }: { readonly children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span
      data-pending={pending ? "" : undefined}
      className={cn(
        "underline decoration-2 underline-offset-[6px] transition-colors",
        "decoration-transparent group-data-[state=active]:decoration-accent",
        pending && "opacity-60",
      )}
    >
      {children}
    </span>
  );
}

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
        **実リンクにする。** 以前は `<button onClick>` で `setParams` を呼んで
        いたが、SSR された button は水和前でも押せてしまい、そのクリックは
        onClick に届かないうえ **DOM に痕跡を残さない**ので後から拾えない
        （検索欄や select は `el.value` を突き合わせて拾えるが、クリックには
        それが無い）。href を持たせれば水和前のクリックはブラウザの遷移に
        なり、JS の有無に関係なく必ず効く。middle-click / 新規タブ / クローラ
        にも正しく見える。

        タブ「風」の見た目だが tabpanel は存在しない（結果一覧はこのバーの外側で
        サーバーレンダリングされ、選択は URL クエリで表現される）。リンク集合
        なので現在地は `aria-pressed` ではなく **`aria-current="page"`** で表す
        （`aria-pressed` は button 用のトグル状態で、リンクには使えない）。
      */}
      <nav aria-label="開催状況" className="flex border-b border-border">
        {EVENT_LIST_TABS.map((tab) => {
          const isActive = params.tab === tab;
          return (
            <Link
              key={tab}
              // 他の facet（q / categoryId）は保ったまま tab だけ差し替え、
              // 結果セットが変わるので page は 1 に戻す（他の facet と同じ規約）。
              href={toAppRoute(
                serializeEventsListParams(EVENTS_PATH, {
                  ...params,
                  tab,
                  page: 1,
                }),
              )}
              // 検索欄・select と同じく履歴を積まない。`scroll={false}` は
              // nuqs 経由だったときの挙動（先頭へ飛ばない）を保つため。
              replace
              scroll={false}
              aria-current={isActive ? "page" : undefined}
              data-state={isActive ? "active" : "inactive"}
              className={cn(
                // タブ内部の padding は viewport 端の safe-area と無関係なので
                // container-padding token は使わず、px-4 と同値の arbitrary value で表現
                "group whitespace-nowrap px-[1rem] py-2.5 text-sm tracking-[0.08em] outline-none transition-colors",
                "text-muted-foreground hover:text-foreground",
                "data-[state=active]:text-accent",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            >
              <TabLabel>{TAB_LABELS[tab]}</TabLabel>
            </Link>
          );
        })}
      </nav>

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
