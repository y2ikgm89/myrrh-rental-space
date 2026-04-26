"use client";

import { useRouter } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import type { PageForEdit } from "@/admin/queries/page-section";
import { PageHeroEditor } from "./PageHeroEditor";
import { SectionEditor } from "./SectionEditor";
import { PageSeoForm } from "../../_seo/_components/PageSeoForm";

interface ContentOnlyPageEditorProps {
  readonly page: PageForEdit;
}

export function ContentOnlyPageEditor({ page }: ContentOnlyPageEditorProps) {
  const router = useRouter();
  const handleSaved = () => router.refresh();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
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
            <CardTitle className="text-base">本文テンプレート未作成</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              このページには編集可能な本文セクションがありません。新規ページには固定テンプレートが自動作成されます。
            </p>
          </CardContent>
        </Card>
      )}

      <Accordion
        type="single"
        collapsible
        className="rounded-lg border bg-card"
      >
        <AccordionItem value="seo" className="border-b-0">
          <AccordionTrigger className="px-4 py-3 text-base font-medium">
            SEO / OGP
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <PageSeoForm page={page} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
