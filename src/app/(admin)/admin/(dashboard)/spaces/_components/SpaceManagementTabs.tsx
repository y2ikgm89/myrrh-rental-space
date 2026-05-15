"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import type { Route } from "next";
import type { AdminSpaceManagementTab } from "@/shared/lib/constants";
import { cn } from "@/shared/lib/cn";
import { toAppRoute } from "@/shared/lib/typed-routes";

// =============================================================================
// 型・定数
// =============================================================================

type SpaceManagementTabsProps = {
  activeTab: AdminSpaceManagementTab;
  children: ReactNode;
};

const TAB_ITEMS: { value: AdminSpaceManagementTab; label: string }[] = [
  { value: "spaces", label: "スペース" },
  { value: "locations", label: "場所" },
  { value: "categories", label: "カテゴリー" },
  { value: "reviews", label: "レビュー" },
];

const tabTriggerClass = cn(
  "inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ring-offset-background transition-all duration-200",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "hover:bg-background/50",
);

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
 * WAI-ARIA APG: ページ遷移は `role="tab"` ではなく `nav` + `aria-current="page"`
 * パターンを採用（accessibility/semantics/html-elements.md §nav vs tab WAI-ARIA 区別）。
 * `nuqs` ではなく `Link` + `URLSearchParams` で `tab` を切り替える（フルナビで RSC が
 * アクティブタブのみ再取得）。各タブ内のフィルタは `adminSpaceSearchParamsParsers`
 * （nuqs）とキーを共有する。アクションボタンはページヘッダー（page.tsx）に配置。
 */
export function SpaceManagementTabs({
  activeTab,
  children,
}: SpaceManagementTabsProps) {
  const searchParams = useSearchParams();

  return (
    <div className="w-full">
      <nav aria-label="スペース管理ナビゲーション" className="mb-2">
        <ul className="inline-flex h-10 w-fit max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground scrollbar-hide">
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

      <div>{children}</div>
    </div>
  );
}
