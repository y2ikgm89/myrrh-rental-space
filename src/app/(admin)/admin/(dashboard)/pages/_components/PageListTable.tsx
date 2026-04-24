"use client";

/**
 * ページ一覧テーブル
 *
 * カラム順（admin-ui-patterns.md §テーブルカラム順序、ワークフロー系例外）:
 *   checkbox → ステータス → タイトル → 種別 → スラッグ(sm+) → セクション数(md+) → 更新日時(md+) → 操作
 *
 * - 空状態は `EmptyState` を表示し CreatePageDialog を起動する
 * - 列ヘッダーソートは PageTableHeader + nuqs `useQueryStates` で URL 同期
 */

import { useState } from "react";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { PageStatusBadge } from "@/admin/components/status-badges";
import { Pagination } from "@/admin/components/ui/Pagination";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import type { PageData } from "@/shared/domain/pages/types";
import { PageActions } from "./PageActions";
import { BulkActions } from "./BulkActions";
import { CreatePageDialog } from "./CreatePageDialog";
import { PageTableHeader } from "./PageTableHeader";

type PageListTableProps = {
  pages: PageData[];
  total: number;
  currentPage: number;
  perPage: number;
};

export function PageListTable({
  pages,
  total,
  currentPage,
  perPage,
}: PageListTableProps) {
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // 空状態（フィルタで絞り込んだ結果が 0 件の場合も含む）
  if (pages.length === 0) {
    return (
      <>
        <EmptyState
          message="ページがありません"
          description="新規作成するか、フィルター条件を変更してください。"
          action={{
            label: "新規ページ作成",
            onClick: () => setCreateOpen(true),
          }}
        />
        <CreatePageDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          showTrigger={false}
        />
      </>
    );
  }

  const selectableSlugs = pages
    .filter((p) => !p.isSystemPage)
    .map((p) => p.slug);

  const allSelected =
    selectableSlugs.length > 0 &&
    selectableSlugs.every((s) => selectedSlugs.includes(s));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedSlugs([]);
    } else {
      setSelectedSlugs(selectableSlugs);
    }
  };

  const toggleOne = (slug: string) => {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <PageTableHeader
              allSelected={allSelected}
              onToggleAll={toggleAll}
            />
            <TableBody>
              {pages.map((page) => {
                const isHomepage = page.slug === "home";

                return (
                  <TableRow
                    key={page.id}
                    className={page.isSystemPage ? "bg-muted/30" : ""}
                  >
                    <TableCell>
                      {!page.isSystemPage && (
                        <input
                          type="checkbox"
                          checked={selectedSlugs.includes(page.slug)}
                          onChange={() => toggleOne(page.slug)}
                          className="rounded border-border"
                          aria-label={`${page.title}を選択`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <PageStatusBadge isPublished={page.isPublished} />
                    </TableCell>
                    <TableCell className="font-medium">{page.title}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {page.isSystemPage ? (
                        <Badge variant="outline">システム</Badge>
                      ) : (
                        <Badge variant="default">カスタム</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden font-mono text-sm text-muted-foreground sm:table-cell">
                      {isHomepage ? "/" : `/${page.slug}`}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground md:table-cell">
                      {page.isSystemPage
                        ? `${page.sectionCount ?? 0}`
                        : "Freeform"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {formatDateTimeShort(page.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <PageActions
                        slug={page.slug}
                        title={page.title}
                        isPublished={page.isPublished}
                        isSystemPage={page.isSystemPage}
                        isHomepage={isHomepage}
                        editHref={`/admin/pages/${page.slug}`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        total={total}
      />

      <BulkActions
        selectedSlugs={selectedSlugs}
        onClear={() => setSelectedSlugs([])}
      />
    </>
  );
}
