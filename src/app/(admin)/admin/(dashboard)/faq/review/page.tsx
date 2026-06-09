/**
 * /admin/faq/review — カテゴリ横断の「対応すべき FAQ」レビュー
 *
 * ランディングのヘルスサマリーから遷移する、カテゴリを跨いだフラット一覧。
 * - draft: 未公開の質問
 * - stale: 長期間更新されていない公開中の質問（FAQ_STALE_DAYS 基準）
 * - low-rated: 「役に立たなかった」票が付いた公開中の質問
 *
 * 編集は各項目の所属カテゴリにスコープした FaqItemDialog で完結する。
 */

import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { IconChevronLeft } from "@tabler/icons-react";
import { getFaqCategories, getFaqItems } from "@/admin/queries/faq";
import { LoadingState } from "@/admin/components/LoadingState";
import { Pagination } from "@/admin/components/ui";
import {
  loadAdminFaqReviewSearchParams,
  type AdminFaqReviewFilter,
} from "@/shared/lib/nuqs";
import type {
  FaqItemQuickFilter,
  FaqItemSort,
} from "@/shared/domain/faq/types";
import { FaqReviewView } from "../_components/FaqReviewView";

export const metadata: Metadata = {
  title: "FAQレビュー | FAQ管理 | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function buildSort(filter: AdminFaqReviewFilter): FaqItemSort {
  switch (filter) {
    case "stale":
      // 最も古い更新を先頭に
      return { sortBy: "updatedAt", sortOrder: "asc" };
    case "low-rated":
      // 役立ち票が少ない（＝要改善度が高い）順
      return { sortBy: "helpful", sortOrder: "asc" };
    case "draft":
    default:
      return { sortBy: "updatedAt", sortOrder: "desc" };
  }
}

async function FaqReviewContent({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}) {
  await connection();

  const [params, { categories }] = await Promise.all([
    loadAdminFaqReviewSearchParams(searchParams),
    getFaqCategories(),
  ]);

  const quickFilter: FaqItemQuickFilter | undefined =
    params.filter === "stale"
      ? "stale"
      : params.filter === "low-rated"
        ? "low-rated"
        : undefined;

  const { items, page, totalPages, total } = await getFaqItems(
    {
      isPublished: params.filter !== "draft",
      ...(params.search ? { search: params.search } : {}),
      ...(quickFilter ? { quickFilter } : {}),
    },
    { page: params.page, limit: params.perPage },
    buildSort(params.filter),
  );

  const allCategories = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <FaqReviewView
        key={params.filter}
        filter={params.filter}
        items={items}
        allCategories={allCategories}
        totalItems={total}
      />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        total={total}
        perPage={params.perPage}
        defaultPerPage={20}
      />
    </div>
  );
}

export default function FaqReviewPage({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}) {
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
          FAQレビュー
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          カテゴリを横断して、見直しが必要な質問をまとめて確認します
        </p>
      </div>

      <Suspense fallback={<LoadingState />}>
        <FaqReviewContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
