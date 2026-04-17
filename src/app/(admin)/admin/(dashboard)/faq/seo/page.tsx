/**
 * /admin/faq/seo — /faq 公開ページの SEO/OGP メタデータ編集
 *
 * FAQ 項目の個別 SEO は廃止済み。/faq 一覧ページ自体の Page テーブル SEO を編集する。
 */

import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { IconChevronLeft } from "@tabler/icons-react";
import { getPageBySlug } from "@/admin/queries/page";
import { ListPageSeoForm } from "@/admin/components/ListPageSeoForm";
import { LoadingState } from "@/admin/components/LoadingState";

export const metadata: Metadata = {
  title: "FAQページSEO | FAQ管理 | Myrrh Rental Space",
};

async function FaqSeoContent() {
  await connection();
  const page = await getPageBySlug("faq");

  if (!page) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        FAQ ページのメタ情報が見つかりません。
        <br />
        シードデータを再実行するか、管理者にお問い合わせください。
      </div>
    );
  }

  return (
    <ListPageSeoForm
      slug="faq"
      seoData={{
        title: page.title,
        metaDescription: page.metaDescription,
        metaKeywords: page.metaKeywords,
        ogpTitle: page.ogpTitle,
        ogpDescription: page.ogpDescription,
        ogpImageUrl: page.ogpImageUrl,
      }}
    />
  );
}

export default function FaqSeoPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/faq"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconChevronLeft className="h-4 w-4" aria-hidden="true" />
          カテゴリ一覧に戻る
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          FAQページSEO
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          /faq 一覧ページのメタデータと OGP を編集します
        </p>
      </div>

      <Suspense fallback={<LoadingState />}>
        <FaqSeoContent />
      </Suspense>
    </div>
  );
}
