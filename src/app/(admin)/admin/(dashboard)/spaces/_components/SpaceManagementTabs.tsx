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
import { CreateCategoryDialog } from "../../_space-categories/_components/CreateCategoryDialog";

// =============================================================================
// 型定義
// =============================================================================

type TabValue = "spaces" | "locations" | "categories";

const TAB_VALUES: [TabValue, ...TabValue[]] = [
  "spaces",
  "locations",
  "categories",
];
const TAB_VALUES_SET = new Set<string>(TAB_VALUES);

function isValidTabValue(value: string): value is TabValue {
  return TAB_VALUES_SET.has(value);
}

interface SpaceManagementTabsProps {
  spacesContent: ReactNode;
  locationsContent: ReactNode;
  categoriesContent: ReactNode;
}

// =============================================================================
// コンポーネント
// =============================================================================

export function SpaceManagementTabs({
  spacesContent,
  locationsContent,
  categoriesContent,
}: SpaceManagementTabsProps) {
  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TAB_VALUES)
      .withDefault("spaces")
      .withOptions({ history: "push", shallow: true }),
  );

  const handleTabChange = (value: string) => {
    if (isValidTabValue(value)) void setActiveTab(value);
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="spaces">スペース</TabsTrigger>
          <TabsTrigger value="locations">場所</TabsTrigger>
          <TabsTrigger value="categories">カテゴリー</TabsTrigger>
        </TabsList>
        {activeTab === "spaces" && (
          <Button asChild>
            <Link href="/admin/spaces/new">新規作成</Link>
          </Button>
        )}
        {activeTab === "locations" && (
          <Button asChild>
            <Link href="/admin/locations/new">新規作成</Link>
          </Button>
        )}
        {activeTab === "categories" && <CreateCategoryDialog />}
      </div>

      <TabsContent
        value="spaces"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        {spacesContent}
      </TabsContent>
      <TabsContent
        value="locations"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        {locationsContent}
      </TabsContent>
      <TabsContent
        value="categories"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        {categoriesContent}
      </TabsContent>
    </Tabs>
  );
}
