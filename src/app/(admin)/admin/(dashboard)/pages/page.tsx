/**
 * ページ管理一覧
 *
 * Lexicalリッチテキストエディターによるページ管理
 * ページの作成・編集・削除・公開状態の管理
 * 検索・フィルター・ページネーション・一括操作・ゴミ箱復元対応
 */

import { getPagesList, getHomepageLastUpdated } from "@/admin/actions/page";
import { loadAdminPageSearchParams } from "@/shared/lib/nuqs";
import {
  CreatePageDialog,
  PageFilters,
  DeletedPagesDialog,
  PageListTable,
} from "./_components";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "ページ管理",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PagesManagementPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await headers();
  const params = await loadAdminPageSearchParams(searchParams);

  const [result, homepageLastUpdated] = await Promise.all([
    getPagesList({
      query: params.q || undefined,
      status: params.status === "all" ? undefined : params.status,
      type: params.type === "all" ? undefined : params.type,
      page: params.page,
      perPage: params.perPage,
      sortOrder: params.sort,
    }),
    getHomepageLastUpdated(),
  ]);

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">ページ管理</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            公開ページのコンテンツ・SEO設定
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DeletedPagesDialog />
          <CreatePageDialog />
        </div>
      </div>

      {/* フィルター */}
      <PageFilters />

      {/* テーブル + ページネーション */}
      <PageListTable
        pages={result.pages}
        total={result.total}
        currentPage={result.page}
        perPage={result.perPage}
        homepageLastUpdated={homepageLastUpdated}
      />
    </div>
  );
}
