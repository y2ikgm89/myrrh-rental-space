"use client";

/**
 * ページ一覧テーブル
 *
 * チェックボックス付きのインタラクティブテーブル
 * ホームページ仮想行 + ページデータ行を表示
 */

import { useState } from "react";
import { Home } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui/table";
import { Badge } from "@/admin/components/ui/badge";
import { Pagination } from "@/admin/components/ui/Pagination";
import { formatDateTimeShort } from "@/shared/lib/utils";
import type { PageData } from "@/shared/domain/pages/types";
import { PageActions } from "./PageActions";
import { BulkActions } from "./BulkActions";

interface PageListTableProps {
  pages: PageData[];
  total: number;
  currentPage: number;
  perPage: number;
  homepageLastUpdated: Date | null;
}

export function PageListTable({
  pages,
  total,
  currentPage,
  perPage,
  homepageLastUpdated,
}: PageListTableProps) {
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);

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
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-border"
                    aria-label="全選択"
                  />
                </TableHead>
                <TableHead className="hidden sm:table-cell">スラッグ</TableHead>
                <TableHead>タイトル</TableHead>
                <TableHead className="hidden md:table-cell">種別</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead className="hidden md:table-cell">更新日時</TableHead>
                <TableHead className="w-40 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* ホームページ（仮想行） */}
              <TableRow className="bg-muted/30">
                <TableCell />
                <TableCell className="hidden font-mono text-sm sm:table-cell">
                  <div className="flex items-center gap-2">
                    <Home className="h-4 w-4 text-primary" />/
                  </div>
                </TableCell>
                <TableCell className="font-medium">ホームページ</TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="outline" className="text-xs">
                    セクション管理
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="success">公開中</Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {homepageLastUpdated
                    ? formatDateTimeShort(homepageLastUpdated)
                    : "-"}
                </TableCell>
                <TableCell className="text-right">
                  <PageActions
                    slug=""
                    title="ホームページ"
                    isPublished
                    isHomepage
                    editHref="/admin/pages/homepage/edit"
                  />
                </TableCell>
              </TableRow>

              {/* ページ一覧 */}
              {pages.map((page) => (
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
                  <TableCell className="hidden font-mono text-sm sm:table-cell">
                    /{page.slug}
                  </TableCell>
                  <TableCell className="font-medium">{page.title}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {page.isSystemPage ? (
                      <Badge variant="outline" className="text-xs">
                        システム
                      </Badge>
                    ) : (
                      <Badge variant="default" className="text-xs">
                        カスタム
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {page.isPublished ? (
                      <Badge variant="success">公開中</Badge>
                    ) : (
                      <Badge variant="secondary">非公開</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {formatDateTimeShort(page.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <PageActions
                      slug={page.slug}
                      title={page.title}
                      isPublished={page.isPublished}
                      isSystemPage={page.isSystemPage}
                      editHref={
                        page.isSystemPage
                          ? undefined
                          : `/admin/pages/${page.slug}/edit`
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}

              {pages.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    条件に一致するページがありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ページネーション */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        total={total}
      />

      {/* 一括操作バー */}
      <BulkActions
        selectedSlugs={selectedSlugs}
        onClear={() => setSelectedSlugs([])}
      />
    </>
  );
}
