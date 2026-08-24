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
import { ensureSystemPageCommand } from "@/shared/domain/pages/commands";
import { getSectionDynamicOptions } from "@/shared/domain/sections/dynamic-options";
import { getFeatureFilterContext } from "@/shared/domain/features/check";
import { getSeoSettings } from "@/shared/domain/settings/queries/site";
import {
  getSystemPageDefinition,
  isSystemPageSlug,
} from "@/shared/lib/validations/page";
import { Button, Badge } from "@/admin/components/ui";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { PageEditor } from "./_components/PageEditor";
import { PublishToggle } from "./_components/PublishToggle";
import { getPagePreviewHref } from "@/shared/lib/preview-routes";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { requirePageEditPage } from "@/admin/helpers/page-auth";

type PageParams = Promise<{ slug: string }>;

type PageProps = {
  params: PageParams;
};

/**
 * `generateMetadata` は **DB へ書かない**（監査 A-55）。
 *
 * 旧実装はここでも `ensureSystemPageCommand(slug)` を呼んでいた。
 * metadata は認可を一切通さないので、新しい system page slug をコードに追加した
 * 直後は **閲覧専用ロールが URL を開くだけで公開ページが作られた**。
 * かつ page 本体と並行に走るので、初回アクセスでは slug の unique 制約で
 * P2002 が起きうる。
 *
 * 行が無いときのタイトルは `SYSTEM_PAGES` の定義から取る（DB を触らない）。
 * 行の作成は page 本体（認可後）と、admin 起動時の `bootstrapSystemPages()` が行う。
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  const page = await getPageWithSections(slug);
  const title = page?.title ?? getSystemPageDefinition(slug)?.title;

  return {
    title: title ? `${title}を編集` : "ページ編集",
  };
}

export default async function EditPagePage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();
  // `ensureSystemPageCommand` は DB へ書く。認可をその前に置く（監査 A-13 / A-55）。
  await requirePageEditPage();

  const { slug } = await params;
  if (isSystemPageSlug(slug)) {
    await ensureSystemPageCommand(slug);
  }

  const page = await getPageForEdit(slug);

  if (!page) {
    notFound();
  }

  const dynamicOptions = await getSectionDynamicOptions();
  const featureCtx = await getFeatureFilterContext();
  const seoSettings = await getSeoSettings();

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
        siteName={seoSettings?.siteName ?? null}
      />
    </AdminDetailLayout>
  );
}
