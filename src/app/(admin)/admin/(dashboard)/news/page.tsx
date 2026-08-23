/**
 * お知らせ管理ページ
 *
 * 2タブ構造で記事一覧・メタ情報を管理
 */

import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { IconPlus } from "@tabler/icons-react";
import { getNewsList } from "@/admin/queries/news";
import { getPageBySlug } from "@/admin/queries/pages";
import { NewsFilters } from "./_components/NewsFilters";
import { NewsTable } from "./_components/NewsTable";
import { NewsManagementTabs } from "./_components/NewsManagementTabs";
import { ListPageSeoForm } from "@/admin/components/ListPageSeoForm";
import { Pagination, Button } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { parseNewsStatusFilter } from "@/shared/lib/validations/enums/helpers";
import { loadAdminNewsSearchParams } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";
import { getEnabledFeatures } from "@/shared/domain/features/check";
import { isAdminFeatureCreateAllowed } from "@/shared/lib/features/admin-nav";
import type { Metadata } from "next";
import { hasPermission } from "@/shared/lib/admin-permissions";
import { requireAdminDashboardPage } from "@/admin/helpers/page-auth";
export const metadata: Metadata = {
  title: "お知らせ管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  searchParams: SearchParams;
};

// ==============================================================================
// 記事一覧タブのコンポーネント
// ==============================================================================

async function NewsList({
  searchParams,
  allowCreate,
}: {
  searchParams: SearchParams;
  allowCreate: boolean;
}) {
  await connection();
  const params = await loadAdminNewsSearchParams(searchParams);
  const status = parseNewsStatusFilter(params.status);

  const result = await getNewsList(
    omitUndefined({ status, search: params.search || undefined }),
    { page: params.page, limit: params.perPage },
  );

  return (
    <>
      <NewsTable news={result.news} allowCreate={allowCreate} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
        perPage={params.perPage}
      />
    </>
  );
}

// ==============================================================================
// SEOタブのコンポーネント
// ==============================================================================

async function SeoContent() {
  await connection();
  const page = await getPageBySlug("news");

  if (!page) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        お知らせページのメタ情報が見つかりません。
        <br />
        シードデータを再実行するか、管理者にお問い合わせください。
      </div>
    );
  }

  return (
    <ListPageSeoForm
      slug="news"
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

// ==============================================================================
// タブパネル（アクティブタブのみ描画）
// ==============================================================================

function tabPanel(
  tab: "posts" | "meta",
  searchParams: SearchParams,
  allowCreate: boolean,
) {
  switch (tab) {
    case "posts":
      return (
        <div className="space-y-6">
          <Suspense fallback={<LoadingState variant="inline" />}>
            <NewsFilters />
          </Suspense>
          <Suspense fallback={<LoadingState />}>
            <NewsList searchParams={searchParams} allowCreate={allowCreate} />
          </Suspense>
        </div>
      );
    case "meta":
      return (
        <Suspense fallback={<LoadingState />}>
          <SeoContent />
        </Suspense>
      );
  }
}

// ==============================================================================
// メインページコンポーネント
// ==============================================================================

export default async function NewsPage({ searchParams }: PageProps) {
  const user = await requireAdminDashboardPage();
  const { tab } = await loadAdminNewsSearchParams(searchParams);
  const enabledFeatures = await getEnabledFeatures();
  // 作成導線は機能フラグだけでなく権限も見る（監査 A-13）。
  // コマンドパレットは同じ遷移先を `hasPermission(role, resource, "create")` で
  // 消しており、こちらだけが出したままだった。
  const allowCreate =
    hasPermission(user.role, "news", "create") &&
    isAdminFeatureCreateAllowed("news", enabledFeatures);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            お知らせ管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            お知らせの作成・編集・公開管理を行います
          </p>
        </div>
        {allowCreate ? (
          <Button asChild>
            <Link href="/admin/news/new">
              <IconPlus className="mr-2 h-4 w-4" />
              新規お知らせ作成
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="space-y-4">
        <NewsManagementTabs />
        {/* タブ依存パネルは Suspense 動的ホールで描画し `shallow:false` ソフトナビ時に
            request 時再ストリーム。`key={tab}` でタブ切替ごとに subtree を作り直す
            （events / reservations / spaces と同じ公式 PPR パターン）。 */}
        <Suspense key={tab} fallback={<LoadingState />}>
          {tabPanel(tab, searchParams, allowCreate)}
        </Suspense>
      </div>
    </div>
  );
}
