"use client";

/**
 * FaqCategoryListView
 *
 * /admin/faq ランディングのクライアント側オーケストレーター。
 * カテゴリ一覧を表示し、カテゴリ作成 Dialog のトグルを担当する。
 * カテゴリクリック → /admin/faq/[categoryId] に遷移（master-detail）。
 */

import { useState } from "react";
import { IconPlus, IconSettings, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { Button } from "@/admin/components/ui";
import type { FaqCategoryWithItems } from "@/shared/domain/faq/types";
import { FaqCategoryGrid } from "./FaqCategoryGrid";
import { FaqCategoryDialog } from "./FaqCategoryDialog";

type FaqCategoryListViewProps = {
  readonly categories: readonly FaqCategoryWithItems[];
};

export function FaqCategoryListView({ categories }: FaqCategoryListViewProps) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            FAQ管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            カテゴリを選択して質問を管理します
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild type="button" variant="outline">
            <Link href="/admin/faq/seo">
              <IconSettings className="mr-1 h-4 w-4" aria-hidden="true" />
              ページSEO
            </Link>
          </Button>
          <Button asChild type="button" variant="destructive">
            <Link href="/admin/faq/trash">
              <IconTrash className="mr-1 h-4 w-4" aria-hidden="true" />
              ゴミ箱
            </Link>
          </Button>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <IconPlus className="mr-1 h-4 w-4" aria-hidden="true" />
            カテゴリを追加
          </Button>
        </div>
      </div>

      <FaqCategoryGrid
        categories={categories}
        onCreate={() => setCreateOpen(true)}
      />

      <FaqCategoryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
      />
    </>
  );
}
