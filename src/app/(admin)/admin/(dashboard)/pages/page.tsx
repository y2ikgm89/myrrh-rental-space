/**
 * ページ管理一覧
 *
 * Lexicalリッチテキストエディターによるページ管理
 * ページの作成・編集・削除・公開状態の管理
 *
 * - ホームページ: セクション管理（DnD対応）で編集
 * - コンテンツ編集可能ページ: Lexicalエディタで編集
 * - システムページ（SEOのみ）: SEO/OGP設定のみ編集可能
 */

import Link from 'next/link'
import { Edit, Home } from 'lucide-react'
import { getPagesList } from '@/admin/actions/page'
import { Button } from '@/admin/components/ui'
import { formatDateTimeShort } from '@/shared/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/admin/components/ui/table'
import { Badge } from '@/admin/components/ui/badge'
import { CreatePageDialog, PageActions } from './_components'
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
            公開ページのコンテンツ・SEO設定
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
              <TableHead>種別</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>更新日時</TableHead>
              <TableHead className="w-40 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* ホームページ（仮想行） */}
            <TableRow className="bg-muted/30">
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

            {/* ページ一覧 */}
            {pages.map((page) => (
                <TableRow key={page.id} className={page.isSystemPage ? 'bg-muted/30' : ''}>
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
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
