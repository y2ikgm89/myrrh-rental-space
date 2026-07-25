/**
 * /admin/faq — FAQ カテゴリ一覧（ランディング）
 *
 * master-detail アーキテクチャの master 側。
 * - カテゴリ一覧（DnD 並び替え + カード click で詳細へ）
 * - カテゴリ作成 Dialog
 * - ゴミ箱 / ページ SEO への導線
 *
 * 質問の個別管理は /admin/faq/[categoryId] 詳細ページで行う。
 */

import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getFaqCategories, getFaqHealthSummary } from "@/admin/queries/faq";
import { LoadingState } from "@/admin/components/LoadingState";
import { getEnabledFeatures } from "@/shared/lib/features/check";
import { isAdminFeatureCreateAllowed } from "@/shared/lib/features/admin-nav";
import { FaqCategoryListView } from "./_components/FaqCategoryListView";

export const metadata: Metadata = {
  title: "FAQ管理 | Myrrh Rental Space",
};

async function FaqCategoryListContent() {
  await connection();
  const [{ categories }, summary, enabledFeatures] = await Promise.all([
    getFaqCategories(),
    getFaqHealthSummary(),
    getEnabledFeatures(),
  ]);
  const allowCreate = isAdminFeatureCreateAllowed("faq", enabledFeatures);
  return (
    <FaqCategoryListView
      categories={categories}
      summary={summary}
      allowCreate={allowCreate}
    />
  );
}

export default function FaqPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<LoadingState />}>
        <FaqCategoryListContent />
      </Suspense>
    </div>
  );
}
