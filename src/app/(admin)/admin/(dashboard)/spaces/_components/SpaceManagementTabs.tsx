"use client";

import { useQueryState } from "nuqs";
import type { AdminSpaceManagementTab } from "@/shared/lib/constants";
import { adminSpaceSearchParamsParsers } from "@/shared/lib/nuqs";
import { cn } from "@/shared/lib/cn";
import { TooltipProvider } from "@/admin/components/ui";
import { AdminNavFeatureDisabledIndicator } from "../../_components/AdminNavFeatureDisabledIndicator";

const TAB_BASE: readonly {
  value: AdminSpaceManagementTab;
  label: string;
  featureModule?: "reviews";
}[] = [
  { value: "spaces", label: "スペース" },
  { value: "locations", label: "場所" },
  { value: "categories", label: "カテゴリー" },
  { value: "reviews", label: "レビュー", featureModule: "reviews" },
];

type SpaceManagementTabsProps = {
  readonly reviewsFeatureDisabled: boolean;
};

/**
 * スペース管理のタブバー（ナビゲーションのみ）。
 *
 * タブ依存のパネル本体は **page 側の `<Suspense key={tab}>` 動的ホール**で描画する
 * （events / reservations と同じ公式 PPR パターン）。本コンポーネントに `children` を
 * 渡して焼き込む方式は、cacheComponents 下で `shallow:false` ソフトナビ時に
 * 再ストリームされず「前タブの内容が残る」stale バグになるため採らない。
 * @see https://nextjs.org/docs/app/getting-started/cache-components
 */
export function SpaceManagementTabs({
  reviewsFeatureDisabled,
}: SpaceManagementTabsProps) {
  const [tab, setTab] = useQueryState(
    "tab",
    adminSpaceSearchParamsParsers.tab.withOptions({
      history: "replace",
      shallow: false,
    }),
  );

  return (
    <nav aria-label="スペース管理ナビゲーション">
      <TooltipProvider delayDuration={200}>
        <ul className="inline-flex min-h-11 w-fit max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground scrollbar-hide">
          {TAB_BASE.map(({ value, label, featureModule }) => {
            const isActive = tab === value;
            const showReviewsBadge =
              featureModule === "reviews" && reviewsFeatureDisabled;
            return (
              <li key={value}>
                <button
                  type="button"
                  onClick={() => void setTab(value)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ring-offset-background transition-all duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "hover:bg-background/50",
                    isActive &&
                      "bg-card text-foreground shadow-sm hover:bg-card",
                    showReviewsBadge && !isActive && "opacity-80",
                  )}
                >
                  <span>{label}</span>
                  {showReviewsBadge && (
                    <AdminNavFeatureDisabledIndicator
                      featureModule="reviews"
                      compact
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </TooltipProvider>
    </nav>
  );
}
