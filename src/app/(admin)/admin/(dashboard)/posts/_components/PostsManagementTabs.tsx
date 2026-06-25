"use client";

import { useQueryState } from "nuqs";
import { adminPostSearchParamsParsers } from "@/shared/lib/nuqs";
import { cn } from "@/shared/lib/cn";

// =============================================================================
// 型・定数
// =============================================================================

type PostManagementTab = "posts" | "categories" | "tags";

const TAB_BASE: readonly { value: PostManagementTab; label: string }[] = [
  { value: "posts", label: "記事一覧" },
  { value: "categories", label: "カテゴリー" },
  { value: "tags", label: "タグ" },
];

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * 投稿管理のタブバー（ナビゲーションのみ）。
 *
 * タブ依存のパネル本体は **page 側の `<Suspense key={tab}>` 動的ホール**で描画する
 * （events / reservations / spaces と同じ公式 PPR パターン）。`shallow:false` で
 * タブ切替ごとにアクティブタブのみ RSC 再ストリーム。
 * @see https://nextjs.org/docs/app/getting-started/cache-components
 */
export function PostsManagementTabs() {
  const [tab, setTab] = useQueryState(
    "tab",
    adminPostSearchParamsParsers.tab.withOptions({
      history: "replace",
      shallow: false,
    }),
  );

  return (
    <nav aria-label="投稿管理ナビゲーション">
      <ul className="inline-flex min-h-11 w-fit max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground scrollbar-hide">
        {TAB_BASE.map(({ value, label }) => {
          const isActive = tab === value;
          return (
            <li key={value}>
              <button
                type="button"
                onClick={() => void setTab(value)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ring-offset-background transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "hover:bg-background/50",
                  isActive && "bg-card text-foreground shadow-sm hover:bg-card",
                )}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
