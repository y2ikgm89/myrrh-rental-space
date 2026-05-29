"use client";

import { useSearchParams } from "next/navigation";
import type { Route } from "next";
import type { EventTabFilter } from "@/shared/lib/nuqs";
import { NavTabs, type NavTabItem } from "@/admin/components/ui";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { EVENT_STATUS_LABELS } from "@/shared/lib/validations/enums/helpers";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// 型・定数
// =============================================================================

type EventTabsProps = {
  activeTab: EventTabFilter;
};

const TAB_BASE: readonly { value: EventTabFilter; label: string }[] = [
  { value: "open", label: "開催" },
  { value: "past", label: "終了" },
  { value: "draft", label: EVENT_STATUS_LABELS[EventStatus.DRAFT] },
  { value: "cancelled", label: EVENT_STATUS_LABELS[EventStatus.CANCELLED] },
  { value: "all", label: "すべて" },
];

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

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * イベント管理のタブナビゲーション。
 *
 * 共通 `NavTabs` primitive 経由で実装（WAI-ARIA APG: ページ遷移は `role="tab"` ではなく
 * `nav` + `aria-current="page"`、`accessibility/semantics/html-elements.md` §nav vs tab 区別）。
 * 時間軸 + ステータスでイベントを分類。フィルタ（検索・期間）は他タブにも保持、
 * ページ番号・ソート・ステータス Select は切替時にリセット。
 */
export function EventTabs({ activeTab }: EventTabsProps) {
  const searchParams = useSearchParams();
  const items: readonly NavTabItem<EventTabFilter>[] = TAB_BASE.map(
    ({ value, label }) => ({
      value,
      label,
      href: hrefForTab(value, searchParams),
    }),
  );

  return (
    <NavTabs items={items} activeValue={activeTab} ariaLabel="イベント分類" />
  );
}
