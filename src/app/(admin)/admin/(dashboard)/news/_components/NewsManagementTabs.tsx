"use client";

import { useQueryState, parseAsStringLiteral } from "nuqs";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/admin/components/ui/tabs";
import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/admin/components/ui";

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
      <div className="mb-2 flex items-center justify-between">
        <TabsList>
          <TabsTrigger value="posts">記事一覧</TabsTrigger>
          <TabsTrigger value="meta">メタ情報</TabsTrigger>
        </TabsList>
        {activeTab === "posts" && (
          <Button asChild className="min-h-10 sm:min-h-9">
            <Link href="/admin/news/new">新規作成</Link>
          </Button>
        )}
      </div>

      <TabsContent value="posts" forceMount className="data-[state=inactive]:hidden">
        {postsContent}
      </TabsContent>
      <TabsContent value="meta" forceMount className="data-[state=inactive]:hidden">
        {seoContent}
      </TabsContent>
    </Tabs>
  );
}
