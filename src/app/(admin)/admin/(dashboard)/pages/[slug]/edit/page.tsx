/**
 * ページ編集画面（固定デザイン + コンテンツ編集）
 *
 * システムページ（about, faq, contact等）の場合、
 * Pageモデルが存在しなければ自動作成します。
 */

import { notFound } from "next/navigation";
import { connection } from "next/server";
import { IconExternalLink } from "@tabler/icons-react";
import {
  getPageForEdit,
  getPageWithSections,
} from "@/admin/queries/page-section";
import { getSectionDynamicOptions } from "@/shared/domain/sections/dynamic-options";
import { getFeatureFilterContext } from "@/shared/lib/features/check";
import { Button, Badge } from "@/admin/components/ui";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { PageEditor } from "./_components/PageEditor";
import { PublishToggle } from "./_components/PublishToggle";
import { getPagePreviewHref } from "@/shared/lib/preview-routes";
import type { Metadata } from "next";
import type { ReactElement } from "react";

type PageParams = Promise<{ slug: string }>;

type PageProps = {
  params: PageParams;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  const page = await getPageWithSections(slug);

  return {
    title: page ? `${page.title}を編集` : "ページ編集",
  };
}

export default async function EditPagePage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();

  const { slug } = await params;

  const page = await getPageForEdit(slug);

  if (!page) {
    notFound();
  }

  const dynamicOptions = await getSectionDynamicOptions();
  const featureCtx = await getFeatureFilterContext();

  return (
    <AdminDetailLayout
      backHref="/admin/pages"
      title={page.title}
      subtitle={`/${slug}`}
      actions={
        <>
          <Badge variant={page.isSystem ? "secondary" : "outline"}>
            {page.isSystem ? "システム" : "カスタム"}
          </Badge>
          {!page.isSystem && (
            <PublishToggle slug={slug} isPublished={page.isPublished} />
          )}
          <Button asChild variant="outline" size="sm">
            <a href={getPagePreviewHref(slug)} target="_blank" rel="noreferrer">
              <IconExternalLink className="h-4 w-4 mr-1" />
              プレビュー
            </a>
          </Button>
        </>
      }
    >
      <PageEditor
        key={page.id}
        page={page}
        dynamicOptions={dynamicOptions}
        disabledSectionTypes={Array.from(featureCtx.disabledSectionTypes)}
      />
    </AdminDetailLayout>
  );
}
