"use client";

import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/shared/lib/cn";

// =============================================================================
// 型定義
// =============================================================================

export type NavTabItem<T extends string> = {
  value: T;
  label: string;
  href: Route;
};

type NavTabsProps<T extends string> = {
  items: readonly NavTabItem<T>[];
  activeValue: T;
  ariaLabel: string;
  className?: string;
};

// =============================================================================
// コンポーネント
// =============================================================================

/**
 * 管理画面のページ遷移型タブナビゲーション SSoT。
 *
 * 同一ページ内の tabpanel 切替には `Tabs` primitive（Radix Tabs、`role="tab"`）を使い、
 * URL を変えて RSC を再フェッチする「ページ遷移型タブ」には本コンポーネントを使う
 * （WAI-ARIA APG 準拠: ページ遷移は `role="tab"` ではなく `nav` + `aria-current="page"`）。
 *
 * スタイル契約は `Tabs` primitive（`tabs.tsx` の `TabsList` / `TabsTrigger`）と一致:
 * - 親コンテナ: `min-h-11` + `bg-muted` + `p-1` + `scrollbar-hide`
 * - 子トリガー: `min-h-11` + `px-3 py-2` + active 時 `bg-background` shadow
 * - WCAG 2.5.5 Enhanced (AAA) 44×44 CSS px 準拠
 *
 * margin（`mb-2` 等）は consumer 側で `className` 経由で付与する。
 */
export function NavTabs<T extends string>({
  items,
  activeValue,
  ariaLabel,
  className,
}: NavTabsProps<T>) {
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ul
        className={cn(
          "inline-flex min-h-11 w-fit max-w-full items-center justify-start gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
          "overflow-x-auto scrollbar-hide",
        )}
      >
        {items.map(({ value, label, href }) => {
          const isActive = activeValue === value;
          return (
            <li key={value}>
              <Link
                href={href}
                scroll={false}
                prefetch={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ring-offset-background transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "hover:bg-background/50",
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
