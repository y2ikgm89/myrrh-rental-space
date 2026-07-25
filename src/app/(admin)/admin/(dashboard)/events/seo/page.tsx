/**
 * /admin/events/seo — /events 公開一覧ページの SEO/OGP メタデータ編集
 *
 * 個別イベント SEO はイベント編集画面。ここでは一覧 Page テーブル SEO を編集する。
 */

import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { IconChevronLeft } from "@tabler/icons-react";
import { getPageBySlug } from "@/admin/queries/pages";
import { ListPageSeoForm } from "@/admin/components/ListPageSeoForm";
import { LoadingState } from "@/admin/components/LoadingState";

export const metadata: Metadata = {
  title: "イベントページSEO | イベント管理 | Myrrh Rental Space",
};

async function EventsSeoContent() {
  await connection();
  const page = await getPageBySlug("events");

  if (!page) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        イベントページのメタ情報が見つかりません。
        <br />
        シードデータを再実行するか、管理者にお問い合わせください。
      </div>
    );
  }

  return (
    <ListPageSeoForm
      slug="events"
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

export default function EventsSeoPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconChevronLeft className="h-4 w-4" aria-hidden="true" />
          イベント一覧に戻る
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          イベントページSEO
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          /events 一覧ページのメタデータと OGP を編集します
        </p>
      </div>

      <Suspense fallback={<LoadingState />}>
        <EventsSeoContent />
      </Suspense>
    </div>
  );
}
