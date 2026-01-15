/**
 * ページ管理一覧
 *
 * Lexicalリッチテキストエディターによるページ管理
 * ページの作成・編集・削除・公開状態の管理
 *
 * ホームページはセクション管理（DnD対応）で編集
 */

import Link from 'next/link'
import { Edit, Home } from 'lucide-react'
import { getPagesList } from '@/actions/admin/page'
import { Button } from '@/components/admin/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { Badge } from '@/components/admin/ui/badge'
import { CreatePageDialog, PageActions } from './_components'
import { SYSTEM_PAGE_SLUGS } from '@/lib/validations/page'
import type { Metadata } from 'next'
import type { ReactElement } from 'react'

export const metadata: Metadata = {
  title: 'ページ管理',
}

export default async function PagesManagementPage(): Promise<ReactElement> {
  const pages = await getPagesList()

  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ページ管理</h1>
          <p className="text-muted-foreground">
            公開ページのコンテンツ編集
          </p>
        </div>
        <CreatePageDialog />
      </div>

      {/* ページ一覧 */}
      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>スラッグ</TableHead>
              <TableHead>タイトル</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>更新日時</TableHead>
              <TableHead className="w-32 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* ホームページ（仮想行） */}
            <TableRow className="bg-muted/30">
              <TableCell className="font-mono text-sm">
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4 text-primary" />
                  /
                  <Badge variant="outline" className="text-xs">
                    システム
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="font-medium">ホームページ</TableCell>
              <TableCell>
                <Badge variant="success">公開中</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">-</TableCell>
              <TableCell className="text-right">
                <Button asChild size="sm" variant="ghost">
                  <Link href="/admin/pages/homepage/edit">
                    <Edit className="h-4 w-4 mr-1" />
                    編集
                  </Link>
                </Button>
              </TableCell>
            </TableRow>

            {/* 通常ページ */}
            {pages.map((page) => {
              const isSystemPage = SYSTEM_PAGE_SLUGS.includes(
                page.slug as typeof SYSTEM_PAGE_SLUGS[number]
              )

              return (
                <TableRow key={page.id}>
                  <TableCell className="font-mono text-sm">
                    /{page.slug}
                    {isSystemPage && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        システム
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{page.title}</TableCell>
                  <TableCell>
                    {page.isPublished ? (
                      <Badge variant="success">公開中</Badge>
                    ) : (
                      <Badge variant="secondary">非公開</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(page.updatedAt).toLocaleDateString('ja-JP', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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
                        isSystemPage={isSystemPage}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
