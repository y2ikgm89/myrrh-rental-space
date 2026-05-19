"use client";

import { useSearchParams } from "next/navigation";
import type { Route } from "next";
import type { ReservationTabFilter } from "@/shared/lib/nuqs";
import { NavTabs, type NavTabItem } from "@/admin/components/ui";
import { toAppRoute } from "@/shared/lib/typed-routes";

// =============================================================================
// 型・定数
// =============================================================================

type ReservationTabsProps = {
  activeTab: ReservationTabFilter;
};

const TAB_BASE: readonly { value: ReservationTabFilter; label: string }[] = [
  { value: "confirmed", label: "確認済み" },
  { value: "pending", label: "保留中" },
  { value: "completed", label: "完了" },
  { value: "cancelled", label: "キャンセル" },
  { value: "all", label: "すべて" },
];

function hrefForTab(
  tab: ReservationTabFilter,
  current: URLSearchParams,
): Route {
  const next = new URLSearchParams(current.toString());
  next.set("tab", tab);
  // タブ切替時はページ番号・ソートをリセット（タブごとに適切な default が効く）
  next.delete("page");
  next.delete("sortBy");
  next.delete("sortOrder");
  const qs = next.toString();
  return toAppRoute(qs ? `/admin/reservations?${qs}` : "/admin/reservations");
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * 予約管理のタブナビゲーション。
 *
 * 共通 `NavTabs` primitive 経由で実装（WAI-ARIA APG: ページ遷移は `role="tab"` ではなく
 * `nav` + `aria-current="page"`、`accessibility/semantics/html-elements.md` §nav vs tab 区別）。
 * `EventTabs` と同型パターンで状態軸（ReservationStatus）で分類。フィルタ（検索・期間）は
 * 他タブにも保持、ページ番号・ソートは切替時にリセット。
 *
 * タブ別 where 条件は `getReservationsQuery` の `buildTabWhere(tab)` で集中管理。
 *
 * - confirmed (確認済み): CONFIRMED — 来店予定（default、active items 優先表示）
 * - pending (保留中): PENDING — 確認待ち、要対応
 * - completed (完了): COMPLETED — 利用済み
 * - cancelled (キャンセル): CANCELLED または NO_SHOW を統合
 * - all (すべて): 全状態
 */
export function ReservationTabs({ activeTab }: ReservationTabsProps) {
  const searchParams = useSearchParams();
  const items: readonly NavTabItem<ReservationTabFilter>[] = TAB_BASE.map(
    ({ value, label }) => ({
      value,
      label,
      href: hrefForTab(value, searchParams),
    }),
  );

  return <NavTabs items={items} activeValue={activeTab} ariaLabel="予約分類" />;
}
