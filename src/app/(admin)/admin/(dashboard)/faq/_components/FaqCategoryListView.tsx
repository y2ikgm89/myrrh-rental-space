"use client";

/**
 * FaqCategoryListView
 *
 * /admin/faq ランディングのクライアント側オーケストレーター。
 * カテゴリ一覧を表示し、カテゴリ作成 Dialog のトグルを担当する。
 * カテゴリクリック → /admin/faq/[categoryId] に遷移（master-detail）。
 */

import { useState } from "react";
import {
  IconClock,
  IconPencil,
  IconPlus,
  IconSettings,
  IconThumbDown,
  IconTrash,
} from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";
import Link from "next/link";
import type { Route } from "next";
import { Badge, Button } from "@/admin/components/ui";
import { toAppRoute } from "@/shared/lib/typed-routes";
import type {
  FaqCategoryWithItems,
  FaqHealthSummary,
} from "@/shared/domain/faq/types";
import { FaqCategoryGrid } from "./FaqCategoryGrid";
import { FaqCategoryDialog } from "./FaqCategoryDialog";

type FaqCategoryListViewProps = {
  readonly categories: readonly FaqCategoryWithItems[];
  readonly summary: FaqHealthSummary;
};

type HealthChip = {
  readonly filter: "draft" | "stale" | "low-rated";
  readonly label: string;
  readonly count: number;
  readonly icon: TablerIcon;
};

export function FaqCategoryListView({
  categories,
  summary,
}: FaqCategoryListViewProps) {
  const [createOpen, setCreateOpen] = useState(false);

  // 対応すべき件数（0 件のものは表示しない＝健全なら何も出さない）
  const allChips: readonly HealthChip[] = [
    {
      filter: "draft",
      label: "下書き",
      count: summary.draftCount,
      icon: IconPencil,
    },
    {
      filter: "stale",
      label: "未更新",
      count: summary.staleCount,
      icon: IconClock,
    },
    {
      filter: "low-rated",
      label: "要改善",
      count: summary.lowRatedCount,
      icon: IconThumbDown,
    },
  ];
  const healthChips = allChips.filter((chip) => chip.count > 0);

  const reviewHref = (filter: HealthChip["filter"]): Route =>
    toAppRoute(`/admin/faq/review?filter=${filter}`);

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

      {healthChips.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="対応が必要な質問"
        >
          <span className="text-xs text-muted-foreground">対応が必要:</span>
          {healthChips.map(({ filter, label, count, icon: ChipIcon }) => (
            <Button
              key={filter}
              asChild
              type="button"
              variant="outline"
              size="sm"
            >
              <Link href={reviewHref(filter)}>
                <ChipIcon className="mr-1 h-4 w-4" aria-hidden="true" />
                {label}
                <Badge variant="secondary" className="ml-2">
                  {count}
                </Badge>
              </Link>
            </Button>
          ))}
        </div>
      )}

      <FaqCategoryGrid
        categories={categories}
        onCreate={() => setCreateOpen(true)}
      />

      <FaqCategoryDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
