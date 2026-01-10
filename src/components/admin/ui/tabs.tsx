'use client'

/**
 * Tabs コンポーネント
 *
 * shadcn/ui準拠のタブUIコンポーネント
 * Radix UI Tabsをベースに実装
 *
 * @see https://ui.shadcn.com/docs/components/tabs
 * @see https://www.radix-ui.com/primitives/docs/components/tabs
 */

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

// =============================================================================
// Tabs Root
// =============================================================================

const Tabs = TabsPrimitive.Root

// =============================================================================
// Tabs List
// =============================================================================

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-start gap-1 rounded-lg bg-muted p-1 text-muted-foreground',
      // スクロール可能（モバイル対応）
      'w-full overflow-x-auto scrollbar-hide',
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

// =============================================================================
// Tabs Trigger
// =============================================================================

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all',
      // フォーカス
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      // 無効状態
      'disabled:pointer-events-none disabled:opacity-50',
      // アクティブ状態
      'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      // ホバー
      'hover:bg-background/50 data-[state=active]:hover:bg-background',
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

// =============================================================================
// Tabs Content
// =============================================================================

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 ring-offset-background',
      // フォーカス
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      // アニメーション
      'data-[state=inactive]:hidden',
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

// =============================================================================
// Export
// =============================================================================

export { Tabs, TabsList, TabsTrigger, TabsContent }
