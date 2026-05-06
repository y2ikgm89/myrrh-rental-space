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
        "inline-flex h-10 items-center justify-start gap-1 rounded-lg bg-muted p-1 text-muted-foreground",
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
  ...props
}: React.ComponentPropsWithRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all duration-200",
        // フォーカス
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // 無効状態
        "disabled:pointer-events-none disabled:opacity-50",
        // アクティブ状態
        "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        // ホバー
        "hover:bg-background/50 data-[state=active]:hover:bg-background",
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
