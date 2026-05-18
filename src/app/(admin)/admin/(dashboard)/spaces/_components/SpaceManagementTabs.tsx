"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import type { Route } from "next";
import type { AdminSpaceManagementTab } from "@/shared/lib/constants";
import { NavTabs, type NavTabItem } from "@/admin/components/ui";
import { toAppRoute } from "@/shared/lib/typed-routes";

// =============================================================================
// 型・定数
// =============================================================================

type SpaceManagementTabsProps = {
  activeTab: AdminSpaceManagementTab;
  children: ReactNode;
};

const TAB_BASE: readonly { value: AdminSpaceManagementTab; label: string }[] = [
  { value: "spaces", label: "スペース" },
  { value: "locations", label: "場所" },
  { value: "categories", label: "カテゴリー" },
  { value: "reviews", label: "レビュー" },
];

function hrefForTab(
  tab: AdminSpaceManagementTab,
  current: URLSearchParams,
): Route {
  const next = new URLSearchParams(current.toString());
  next.set("tab", tab);
  const qs = next.toString();
  return toAppRoute(qs ? `/admin/spaces?${qs}` : "/admin/spaces");
}

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * スペース管理のタブナビゲーション。
 *
 * 共通 `NavTabs` primitive 経由で実装（WAI-ARIA APG: ページ遷移は `role="tab"` ではなく
 * `nav` + `aria-current="page"`、`accessibility/semantics/html-elements.md` §nav vs tab 区別）。
 * `nuqs` ではなく `Link` + `URLSearchParams` で `tab` を切り替える（フルナビで RSC が
 * アクティブタブのみ再取得）。各タブ内のフィルタは `adminSpaceSearchParamsParsers`
 * （nuqs）とキーを共有する。アクションボタンはページヘッダー（page.tsx）に配置。
 */
export function SpaceManagementTabs({
  activeTab,
  children,
}: SpaceManagementTabsProps) {
  const searchParams = useSearchParams();
  const items: readonly NavTabItem<AdminSpaceManagementTab>[] = TAB_BASE.map(
    ({ value, label }) => ({
      value,
      label,
      href: hrefForTab(value, searchParams),
    }),
  );

  return (
    <div className="w-full">
      <NavTabs
        items={items}
        activeValue={activeTab}
        ariaLabel="スペース管理ナビゲーション"
        className="mb-2"
      />
      <div>{children}</div>
    </div>
  );
}
