"use client";

/**
 * ページ一覧テーブル
 *
 * チェックボックス付きのインタラクティブテーブル
 * ホームページは Page レコードとして通常表示
 */

import { useState } from "react";
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
}

export function PageListTable({
  pages,
  total,
  currentPage,
  perPage,
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
                <TableHead className="whitespace-nowrap">ステータス</TableHead>
                <TableHead className="hidden md:table-cell">
                  セクション数
                </TableHead>
                <TableHead className="hidden md:table-cell">更新日時</TableHead>
                <TableHead className="w-40 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
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
                    <TableCell className="hidden font-mono text-sm sm:table-cell">
                      {isHomepage ? "/" : `/${page.slug}`}
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
                    <TableCell className="whitespace-nowrap">
                      {page.isPublished ? (
                        <Badge variant="success">公開中</Badge>
                      ) : (
                        <Badge variant="secondary">非公開</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {page.sectionCount ?? 0}
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
                        isHomepage={isHomepage}
                        editHref={`/admin/pages/${page.slug}/edit`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
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
