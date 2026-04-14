"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import { IconTrash } from "@tabler/icons-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button,
} from "@/admin/components/ui";

const TAB_VALUES = ["items", "categories", "seo", "trash"] as const;
type TabValue = (typeof TAB_VALUES)[number];
const TAB_VALUE_SET = new Set<string>(TAB_VALUES);

function isValidTabValue(value: string): value is TabValue {
  return TAB_VALUE_SET.has(value);
}

interface FaqManagementTabsProps {
  readonly itemsContent: ReactNode;
  readonly categoriesContent: ReactNode;
  readonly seoContent: ReactNode;
  readonly trashContent: ReactNode;
}

export function FaqManagementTabs({
  itemsContent,
  categoriesContent,
  seoContent,
  trashContent,
}: FaqManagementTabsProps) {
  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TAB_VALUES)
      .withDefault("items")
      .withOptions({ history: "push", shallow: false }),
  );

  const handleTabChange = (value: string) => {
    if (isValidTabValue(value)) void setActiveTab(value);
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <TabsList>
          <TabsTrigger value="items">質問一覧</TabsTrigger>
          <TabsTrigger value="categories">カテゴリ</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="trash">
            <IconTrash className="mr-1 h-3 w-3" aria-hidden="true" />
            ゴミ箱
          </TabsTrigger>
        </TabsList>
        {activeTab === "items" && (
          <Button asChild className="min-h-10 sm:min-h-9">
            <Link href="/admin/faq/items/new">質問を追加</Link>
          </Button>
        )}
        {activeTab === "categories" && (
          <Button asChild className="min-h-10 sm:min-h-9">
            <Link href="/admin/faq/categories/new">カテゴリを追加</Link>
          </Button>
        )}
      </div>

      <TabsContent value="items" className="mt-4 space-y-4">
        {itemsContent}
      </TabsContent>
      <TabsContent value="categories" className="mt-4 space-y-4">
        {categoriesContent}
      </TabsContent>
      <TabsContent value="seo" className="mt-4 space-y-4">
        {seoContent}
      </TabsContent>
      <TabsContent value="trash" className="mt-4 space-y-4">
        {trashContent}
      </TabsContent>
    </Tabs>
  );
}
