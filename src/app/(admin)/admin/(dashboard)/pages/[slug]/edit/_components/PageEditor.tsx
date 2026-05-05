"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/admin/components/ui";
import type { PageForEdit } from "@/admin/queries/page-section";
import type { DynamicSectionOptions } from "@/admin/queries/section-dynamic-options";
import { getAllSectionDefinitions } from "@/shared/lib/sections/registry";
import { getPageTemplate } from "@/shared/lib/sections/page-templates";
import { AddSectionDialog } from "./AddSectionDialog";
import { SectionEditPanel } from "./SectionEditPanel";
import { SectionListSidebar } from "./SectionListSidebar";
import { sectionEditQueryParser } from "./section-edit-state";
import { PageSeoForm } from "../../_seo/_components/PageSeoForm";
import {
  PAGE_EDIT_TAB_LABELS,
  PAGE_EDIT_TAB_VALUES,
  parsePageEditTabValue,
} from "./page-edit-tabs";

interface PageEditorProps {
  readonly page: PageForEdit;
  readonly dynamicOptions: DynamicSectionOptions;
}

export function PageEditor({ page, dynamicOptions }: PageEditorProps) {
  const router = useRouter();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringLiteral(PAGE_EDIT_TAB_VALUES)
      .withDefault("content")
      .withOptions({ history: "push", shallow: true }),
  );

  const [activeSectionIdRaw, setActiveSectionId] = useQueryState(
    "section",
    sectionEditQueryParser,
  );

  // section URL state を sections[0]?.id にフォールバック（render 中 derive）
  const activeSectionId =
    activeSectionIdRaw && page.sections.some((s) => s.id === activeSectionIdRaw)
      ? activeSectionIdRaw
      : (page.sections[0]?.id ?? "");

  const activeSection =
    page.sections.find((s) => s.id === activeSectionId) ?? null;

  // 利用可能な section type を計算
  // - page-hero は既存にあれば除外
  // - PAGE_TEMPLATES[page.template].allowedSectionTypes でフィルタ（spec §5.1）
  // - template が未知の場合は全 type 許容（Page.template が unknown の fallback）
  const template = getPageTemplate(page.template);
  const allowedSet = template
    ? new Set<string>(template.allowedSectionTypes)
    : null;
  const requiredSet = new Set<string>(template?.requiredSectionTypes ?? []);
  const hasPageHero = page.sections.some((s) => s.type === "page-hero");
  const availableTypes = getAllSectionDefinitions()
    .map((def) => def.type)
    .filter((type) => {
      if (type === "page-hero" && hasPageHero) return false;
      if (allowedSet && !allowedSet.has(type)) return false;
      return true;
    });

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => {
        const tab = parsePageEditTabValue(v);
        if (tab) void setActiveTab(tab);
      }}
      className="space-y-5"
    >
      <TabsList className="h-auto flex-wrap gap-1">
        {PAGE_EDIT_TAB_VALUES.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {PAGE_EDIT_TAB_LABELS[tab]}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent
        value="content"
        forceMount
        className="space-y-5 outline-none data-[state=inactive]:hidden"
      >
        {page.sections.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">セクション未作成</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                このページには編集可能なセクションがまだありません。「追加」ボタンから最初のセクションを作成してください。
              </p>
              <SectionListSidebar
                sections={page.sections}
                activeSectionId=""
                onSelect={(id) => void setActiveSectionId(id)}
                onAddClick={() => setAddDialogOpen(true)}
                requiredSectionTypes={requiredSet}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <SectionListSidebar
              sections={page.sections}
              activeSectionId={activeSectionId}
              onSelect={(id) => void setActiveSectionId(id)}
              onAddClick={() => setAddDialogOpen(true)}
              requiredSectionTypes={requiredSet}
            />
            {activeSection ? (
              <SectionEditPanel
                section={activeSection}
                dynamicOptions={dynamicOptions}
                onUpdated={() => router.refresh()}
              />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    セクションが選択されていません
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    左の一覧からセクションを選択してください。
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <AddSectionDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          pageId={page.id}
          availableTypes={availableTypes}
          onCreated={(sectionId) => {
            void setActiveSectionId(sectionId);
          }}
        />
      </TabsContent>

      <TabsContent
        value="seo"
        forceMount
        className="outline-none data-[state=inactive]:hidden"
      >
        <PageSeoForm page={page} />
      </TabsContent>
    </Tabs>
  );
}
