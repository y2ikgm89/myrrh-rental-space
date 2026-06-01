"use client";

/**
 * Tabs コンポーネント
 *
 * shadcn/ui準拠のタブUIコンポーネント
 * Radix UI Tabsをベースに実装
 *
 * @see https://ui.shadcn.com/docs/components/tabs
 * @see https://www.radix-ui.com/primitives/docs/components/tabs
 */

import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/shared/lib/cn";

// =============================================================================
// Tabs Root
// =============================================================================

const Tabs = TabsPrimitive.Root;

// =============================================================================
// Tabs List
// =============================================================================

function TabsList({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex min-h-11 items-center justify-start gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
        // スクロール可能（モバイル対応）
        "w-fit max-w-full overflow-x-auto scrollbar-hide",
        className,
      )}
      {...props}
    />
  );
}

// =============================================================================
// Tabs Trigger
// =============================================================================

function TabsTrigger({
  className,
  ref,
  type,
  ...props
}: React.ComponentPropsWithRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      // `<form>` 内に Tabs を配置した際、HTML 仕様で `<button>` の default
      // `type` は `"submit"` のため tab 切替が form submit を発火する silent bug
      // が起きる。明示的に `type="button"` を default 設定して回避する
      // (caller が type を渡せば override 可能)。
      type={type ?? "button"}
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ring-offset-background transition-all duration-200",
        // フォーカス
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // 無効状態
        "disabled:pointer-events-none disabled:opacity-50",
        // アクティブ状態（純白 bg-card で muted トラックから浮き上がらせる）
        "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        // ホバー
        "hover:bg-background/50 data-[state=active]:hover:bg-card",
        className,
      )}
      {...props}
    />
  );
}

// =============================================================================
// Tabs Content
// =============================================================================

function TabsContent({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        "mt-4 ring-offset-background",
        // フォーカス
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // アニメーション
        "data-[state=inactive]:hidden",
        className,
      )}
      {...props}
    />
  );
}

// =============================================================================
// Export
// =============================================================================

export { Tabs, TabsList, TabsTrigger, TabsContent };
