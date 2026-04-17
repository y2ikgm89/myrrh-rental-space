"use client";

import { useQueryState, parseAsStringLiteral } from "nuqs";
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

type TabValue = "posts" | "meta";

const TAB_VALUES: [TabValue, ...TabValue[]] = ["posts", "meta"];
const TAB_VALUES_SET = new Set<string>(TAB_VALUES);

function isValidTabValue(value: string): value is TabValue {
  return TAB_VALUES_SET.has(value);
}

interface NewsManagementTabsProps {
  postsContent: ReactNode;
  seoContent: ReactNode;
}

// =============================================================================
// コンポーネント
// =============================================================================

export function NewsManagementTabs({
  postsContent,
  seoContent,
}: NewsManagementTabsProps) {
  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TAB_VALUES)
      .withDefault("posts")
      .withOptions({ history: "push", shallow: true }),
  );

  const handleTabChange = (value: string) => {
    if (isValidTabValue(value)) void setActiveTab(value);
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="mb-2">
        <TabsTrigger value="posts">記事一覧</TabsTrigger>
        <TabsTrigger value="meta">メタ情報</TabsTrigger>
      </TabsList>

      <TabsContent
        value="posts"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        {postsContent}
      </TabsContent>
      <TabsContent
        value="meta"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        {seoContent}
      </TabsContent>
    </Tabs>
  );
}
