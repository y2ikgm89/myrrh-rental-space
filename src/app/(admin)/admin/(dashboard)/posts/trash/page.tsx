/**
 * /admin/posts/trash — 投稿ゴミ箱
 *
 * 削除済み投稿（30 日以内）を復元または完全削除する。
 */

import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { IconChevronLeft } from "@tabler/icons-react";
import { getDeletedPosts } from "@/admin/queries/post";
import { LoadingState } from "@/admin/components/LoadingState";
import { PostTrashTable } from "../_components/PostTrashTable";

export const metadata: Metadata = {
  title: "投稿ゴミ箱 | 投稿管理 | Myrrh Rental Space",
};

async function PostTrashContent() {
  await connection();
  const deletedPosts = await getDeletedPosts();
  return <PostTrashTable posts={deletedPosts} />;
}

export default function PostTrashPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/posts"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconChevronLeft className="h-4 w-4" aria-hidden="true" />
          投稿一覧に戻る
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          投稿ゴミ箱
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          削除済み投稿を復元または完全削除します（30 日以内）
        </p>
      </div>

      <Suspense fallback={<LoadingState />}>
        <PostTrashContent />
      </Suspense>
    </div>
  );
}
