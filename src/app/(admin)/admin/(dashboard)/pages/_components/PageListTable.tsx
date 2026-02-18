'use client'

/**
 * ページ一覧テーブル
 *
 * チェックボックス付きのインタラクティブテーブル
 * ホームページ仮想行 + ページデータ行を表示
 */

import { useState } from 'react'
import Link from 'next/link'
import { Edit, Home } from 'lucide-react'
import { Button } from '@/admin/components/ui'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/admin/components/ui/table'
import { Badge } from '@/admin/components/ui/badge'
import { Pagination } from '@/admin/components/ui/Pagination'
import { formatDateTimeShort } from '@/shared/lib/utils'
import { PageActions } from './PageActions'
import { BulkActions } from './BulkActions'
import type { PageModel as PageData } from '@/shared/generated/prisma/models/Page'

interface PageListTableProps {
  pages: PageData[]
  total: number
  currentPage: number
  perPage: number
  homepageLastUpdated: Date | null
}

export function PageListTable({
  pages,
  total,
  currentPage,
  perPage,
  homepageLastUpdated,
}: PageListTableProps) {
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])

  const selectableSlugs = pages
    .filter((p) => !p.isSystemPage)
    .map((p) => p.slug)

  const allSelected =
    selectableSlugs.length > 0 &&
    selectableSlugs.every((s) => selectedSlugs.includes(s))

  const toggleAll = () => {
    if (allSelected) {
      setSelectedSlugs([])
    } else {
      setSelectedSlugs(selectableSlugs)
    }
  }

  const toggleOne = (slug: string) => {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <>
      <div className="rounded-lg border bg-card">
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
              <TableHead>スラッグ</TableHead>
              <TableHead>タイトル</TableHead>
              <TableHead>種別</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>更新日時</TableHead>
              <TableHead className="w-40 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* ホームページ（仮想行） */}
            <TableRow className="bg-muted/30">
              <TableCell />
              <TableCell className="font-mono text-sm">
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4 text-primary" />
                  /
                </div>
              </TableCell>
              <TableCell className="font-medium">ホームページ</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  セクション管理
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="success">公開中</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {homepageLastUpdated ? formatDateTimeShort(homepageLastUpdated) : '-'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/admin/pages/homepage/edit">
                      <Edit className="h-4 w-4 mr-1" />
                      編集
                    </Link>
                  </Button>
                  <PageActions
                    slug=""
                    title="ホームページ"
                    isPublished
                    isHomepage
                  />
                </div>
              </TableCell>
            </TableRow>

            {/* ページ一覧 */}
            {pages.map((page) => (
              <TableRow
                key={page.id}
                className={page.isSystemPage ? 'bg-muted/30' : ''}
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
                <TableCell className="font-mono text-sm">
                  /{page.slug}
                </TableCell>
                <TableCell className="font-medium">{page.title}</TableCell>
                <TableCell>
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
                <TableCell className="text-muted-foreground">
                  {formatDateTimeShort(page.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/admin/pages/${page.slug}/edit`}>
                        <Edit className="h-4 w-4 mr-1" />
                        編集
                      </Link>
                    </Button>
                    <PageActions
                      slug={page.slug}
                      title={page.title}
                      isPublished={page.isPublished}
                      isSystemPage={page.isSystemPage}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {pages.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  条件に一致するページがありません
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
  )
}
