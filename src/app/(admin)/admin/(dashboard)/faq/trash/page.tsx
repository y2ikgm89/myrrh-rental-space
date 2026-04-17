/**
 * /admin/faq/trash — FAQ ゴミ箱
 *
 * 削除済みカテゴリ・質問（30 日以内）を復元または完全削除する。
 */

import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { IconChevronLeft } from "@tabler/icons-react";
import {
  getDeletedFaqCategories,
  getDeletedFaqItems,
} from "@/admin/queries/faq";
import { LoadingState } from "@/admin/components/LoadingState";
import { FaqTrashTable } from "../_components/FaqTrashTable";

export const metadata: Metadata = {
  title: "FAQゴミ箱 | FAQ管理 | Myrrh Rental Space",
};

async function FaqTrashContent() {
  await connection();
  const [deletedCategories, deletedItems] = await Promise.all([
    getDeletedFaqCategories(),
    getDeletedFaqItems(),
  ]);
  return <FaqTrashTable categories={deletedCategories} items={deletedItems} />;
}

export default function FaqTrashPage() {
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
          FAQゴミ箱
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          削除済みカテゴリと質問を復元または完全削除します（30 日以内）
        </p>
      </div>

      <Suspense fallback={<LoadingState />}>
        <FaqTrashContent />
      </Suspense>
    </div>
  );
}
