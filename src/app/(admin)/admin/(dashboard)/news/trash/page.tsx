/**
 * /admin/news/trash — お知らせゴミ箱
 *
 * 削除済みお知らせ（30 日以内）を復元または完全削除する。
 */

import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { IconChevronLeft } from "@tabler/icons-react";
import { getDeletedNews } from "@/admin/queries/news";
import { LoadingState } from "@/admin/components/LoadingState";
import { NewsTrashTable } from "../_components/NewsTrashTable";

export const metadata: Metadata = {
  title: "お知らせゴミ箱 | お知らせ管理 | Myrrh Rental Space",
};

async function NewsTrashContent() {
  await connection();
  const deletedNews = await getDeletedNews();
  return <NewsTrashTable news={deletedNews} />;
}

export default function NewsTrashPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/news"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconChevronLeft className="h-4 w-4" aria-hidden="true" />
          お知らせ一覧に戻る
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          お知らせゴミ箱
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          削除済みお知らせを復元または完全削除します（30 日以内）
        </p>
      </div>

      <Suspense fallback={<LoadingState />}>
        <NewsTrashContent />
      </Suspense>
    </div>
  );
}
