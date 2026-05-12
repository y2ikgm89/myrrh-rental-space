"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Route } from "next";
import type { EventTabFilter } from "@/shared/lib/nuqs";
import { cn } from "@/shared/lib/cn";
import { toAppRoute } from "@/shared/lib/typed-routes";

type EventTabsProps = {
  activeTab: EventTabFilter;
};

const TAB_ITEMS: { value: EventTabFilter; label: string }[] = [
  { value: "open", label: "開催" },
  { value: "past", label: "終了" },
  { value: "draft", label: "下書き" },
  { value: "cancelled", label: "キャンセル" },
  { value: "all", label: "すべて" },
];

const tabTriggerClass = cn(
  "inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all duration-200",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "hover:bg-background/50",
);

function hrefForTab(tab: EventTabFilter, current: URLSearchParams): Route {
  const next = new URLSearchParams(current.toString());
  next.set("tab", tab);
  // タブ切替時はページ番号・ソート・ステータス Select をリセット（タブごとに適切な default が効く）
  next.delete("page");
  next.delete("sortBy");
  next.delete("sortOrder");
  next.delete("status");
  const qs = next.toString();
  return toAppRoute(qs ? `/admin/events?${qs}` : "/admin/events");
}

/**
 * イベント管理のタブナビゲーション。
 * 時間軸 + ステータスでイベントを分類し、`nav` + `aria-current="page"` でセマンティック実装。
 * フィルタ（検索・期間）は他タブにも保持、ページ番号・ソート・ステータス Select は切替時にリセット。
 */
export function EventTabs({ activeTab }: EventTabsProps) {
  const searchParams = useSearchParams();

  return (
    <nav aria-label="イベント分類">
      <ul className="inline-flex w-fit max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground">
        {TAB_ITEMS.map(({ value, label }) => {
          const isActive = activeTab === value;
          return (
            <li key={value}>
              <Link
                href={hrefForTab(value, searchParams)}
                scroll={false}
                prefetch={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  tabTriggerClass,
                  isActive &&
                    "bg-background text-foreground shadow-sm hover:bg-background",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
