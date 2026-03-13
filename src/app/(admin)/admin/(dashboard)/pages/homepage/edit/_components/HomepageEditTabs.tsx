"use client";

/**
 * ホームページ編集タブ切替コンポーネント
 *
 * nuqs でURL状態管理（?tab=sections / ?tab=seo）
 * PageEditTabs と同構造。sections タブは HomepageTab、seo タブは PageSeoForm。
 */

import { useState } from "react";
import { useQueryState, parseAsStringLiteral } from "nuqs";
import { Plus } from "lucide-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/admin/components/ui/tabs";
import { Button } from "@/admin/components/ui";
import { HomepageTab } from "@/app/(admin)/admin/(dashboard)/settings/_components/homepage/HomepageTab";
import { PageSeoForm } from "../../../[slug]/_seo/_components/PageSeoForm";

// =============================================================================
// Types
// =============================================================================

const tabValues = ["sections", "seo"] satisfies [string, ...string[]];

interface PageSeoData {
  slug: string;
  title: string;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
}

interface HomepageEditTabsProps {
  isInstagramConnected: boolean;
  page: PageSeoData;
}

// =============================================================================
// Component
// =============================================================================

export function HomepageEditTabs({
  isInstagramConnected,
  page,
}: HomepageEditTabsProps) {
  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringLiteral(tabValues).withDefault("sections"),
  );
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <TabsList>
          <TabsTrigger value="sections">セクション</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>
        {activeTab === "sections" && (
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            セクションを追加
          </Button>
        )}
      </div>
      <TabsContent value="sections">
        <HomepageTab
          isInstagramConnected={isInstagramConnected}
          showAddDialog={showAddDialog}
          onShowAddDialogChange={setShowAddDialog}
        />
      </TabsContent>
      <TabsContent value="seo">
        <PageSeoForm page={page} />
      </TabsContent>
    </Tabs>
  );
}
