"use client";

/**
 * 設定ページ用タブコンポーネント
 *
 * nuqs でURL状態管理（?tab=xxx）
 * Radix UI Tabs ベース
 */

import { useQueryState } from "nuqs";
import { parseAsStringLiteral } from "nuqs";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/admin/components/ui/tabs";
import type { ReactNode } from "react";

// =============================================================================
// 型定義
// =============================================================================

export interface TabConfig {
  /** タブのキー（URLパラメータ値） */
  value: string;
  /** タブのラベル */
  label: string;
  /** タブのコンテンツ */
  content: ReactNode;
}

interface SettingsTabsProps {
  /** タブ設定の配列 */
  tabs: TabConfig[];
  /** デフォルトで選択されるタブ（未指定時は最初のタブ） */
  defaultTab?: string;
}

// =============================================================================
// コンポーネント
// =============================================================================

export function SettingsTabs({ tabs, defaultTab }: SettingsTabsProps) {
  const firstTab = defaultTab ?? tabs[0]?.value ?? "";
  // parseAsStringLiteral は非空タプルを要求 — ランタイムで構築
  const values = tabs.map((t) => t.value);
  const tabValues: [string, ...string[]] =
    values[0] !== undefined ? [values[0], ...values.slice(1)] : [firstTab];

  // nuqs でURLパラメータと同期
  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringLiteral(tabValues)
      .withDefault(firstTab)
      .withOptions({ history: "push", shallow: true }),
  );

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="mb-2">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
