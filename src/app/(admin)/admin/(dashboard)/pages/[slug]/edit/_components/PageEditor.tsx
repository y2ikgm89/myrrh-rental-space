"use client";

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
import { PageHeroEditor } from "./PageHeroEditor";
import { SectionEditor } from "./SectionEditor";
import { PageSeoForm } from "../../_seo/_components/PageSeoForm";
import {
  PAGE_EDIT_TAB_LABELS,
  PAGE_EDIT_TAB_VALUES,
  parsePageEditTabValue,
} from "./page-edit-tabs";

interface PageEditorProps {
  readonly page: PageForEdit;
}

export function PageEditor({ page }: PageEditorProps) {
  const router = useRouter();
  const handleSaved = () => router.refresh();

  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringLiteral(PAGE_EDIT_TAB_VALUES)
      .withDefault("content")
      .withOptions({ history: "push", shallow: true }),
  );

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
        {page.slug === "home" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ホームヒーロー</CardTitle>
            </CardHeader>
            <CardContent>
              <PageHeroEditor
                pageSlug={page.slug}
                initial={page.pageHero}
                onSaved={handleSaved}
              />
            </CardContent>
          </Card>
        ) : null}

        {page.sections.length > 0 ? (
          page.sections.map((section) => (
            <SectionEditor
              key={section.id}
              section={section}
              onSectionUpdated={handleSaved}
            />
          ))
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                本文テンプレート未作成
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                このページには編集可能な本文セクションがありません。新規ページには固定テンプレートが自動作成されます。
              </p>
            </CardContent>
          </Card>
        )}
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
