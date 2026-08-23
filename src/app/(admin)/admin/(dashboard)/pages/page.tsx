/**
 * ページ管理一覧
 *
 * Lexicalリッチテキストエディターによるページ管理
 * ページの作成・編集・削除・公開状態の管理
 * 検索・フィルター・ページネーション・一括操作・ゴミ箱復元対応
 */

import { connection } from "next/server";
import { getPagesList } from "@/admin/queries/pages";
import { loadAdminPageSearchParams } from "@/shared/lib/nuqs";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  CreatePageDialog,
  PageFilters,
  DeletedPagesDialog,
  PageListTable,
} from "./_components";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { hasPermission } from "@/shared/lib/admin-permissions";
import { requireAdminDashboardPage } from "@/admin/helpers/page-auth";

export const metadata: Metadata = {
  title: "ページ管理",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PagesManagementPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();
  const user = await requireAdminDashboardPage();
  // 行内 / 一括のミューテーション導線を予約一覧と同じ形で権限に揃える（監査 A-14）。
  const canCreatePage = hasPermission(user.role, "page", "create");
  const canPublishPage = hasPermission(user.role, "page", "publish");
  const canDeletePage = hasPermission(user.role, "page", "delete");
  // ゴミ箱の復元は `page:update`、完全削除は `page:delete`。
  const canOpenTrash =
    hasPermission(user.role, "page", "update") || canDeletePage;

  const params = await loadAdminPageSearchParams(searchParams);

  const result = await getPagesList(
    omitUndefined({
      query: params.q || undefined,
      status: params.status === "all" ? undefined : params.status,
      type: params.type === "all" ? undefined : params.type,
      page: params.page,
      perPage: params.perPage,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
    }),
  );

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            ページ管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            公開ページのコンテンツ・SEO設定
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canOpenTrash ? <DeletedPagesDialog /> : null}
          {canCreatePage ? <CreatePageDialog /> : null}
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
        canCreate={canCreatePage}
        canPublish={canPublishPage}
        canDelete={canDeletePage}
      />
    </div>
  );
}
