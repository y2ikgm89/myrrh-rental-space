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

type TabValue = "posts" | "categories" | "tags" | "comments";

const TAB_VALUES: [TabValue, ...TabValue[]] = [
  "posts",
  "categories",
  "tags",
  "comments",
];
const TAB_VALUES_SET = new Set<string>(TAB_VALUES);

function isValidTabValue(value: string): value is TabValue {
  return TAB_VALUES_SET.has(value);
}

interface PostsManagementTabsProps {
  postsContent: ReactNode;
  categoriesContent: ReactNode;
  tagsContent: ReactNode;
  commentsContent: ReactNode;
}

// =============================================================================
// コンポーネント
// =============================================================================

export function PostsManagementTabs({
  postsContent,
  categoriesContent,
  tagsContent,
  commentsContent,
}: PostsManagementTabsProps) {
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
          <TabsTrigger value="categories">カテゴリー</TabsTrigger>
          <TabsTrigger value="tags">タグ</TabsTrigger>
          <TabsTrigger value="comments">コメント</TabsTrigger>
        </TabsList>
        {activeTab === "posts" && (
          <Button asChild className="min-h-10 sm:min-h-9">
            <Link href="/admin/posts/new">新規作成</Link>
          </Button>
        )}
      </div>

      <TabsContent value="posts" forceMount className="data-[state=inactive]:hidden">
        {postsContent}
      </TabsContent>
      <TabsContent value="categories" forceMount className="data-[state=inactive]:hidden">
        {categoriesContent}
      </TabsContent>
      <TabsContent value="tags" forceMount className="data-[state=inactive]:hidden">
        {tagsContent}
      </TabsContent>
      <TabsContent value="comments" forceMount className="data-[state=inactive]:hidden">
        {commentsContent}
      </TabsContent>
    </Tabs>
  );
}
