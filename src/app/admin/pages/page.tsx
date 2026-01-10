/**
 * ページ管理一覧
 *
 * 公開ページ（privacy, terms等）とホームページヒーローの管理
 */

import Link from 'next/link'
import { getPagesList } from '@/actions/admin/page'
import { getHomepageHero } from '@/actions/admin/homepage-hero'
import { Button } from '@/components/admin/ui'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { Badge } from '@/components/admin/ui/badge'
import type { Metadata } from 'next'
import type { ReactElement } from 'react'

export const metadata: Metadata = {
  title: 'ページ管理',
}

export default async function PagesManagementPage(): Promise<ReactElement> {
  const [pages, hero] = await Promise.all([
    getPagesList(),
    getHomepageHero(),
  ])

  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold">ページ管理</h1>
        <p className="text-muted-foreground">
          公開ページのコンテンツ編集とホームページヒーローの設定
        </p>
      </div>

      {/* ホームページヒーローセクション */}
      <section className="rounded-lg border bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">ホームページヒーロー</h2>
            <p className="text-sm text-muted-foreground">
              トップページのヒーローセクションを編集します
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/pages/homepage">編集</Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">タイトル</p>
            <p className="font-medium">{hero.title}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">サブタイトル</p>
            <p className="font-medium">{hero.subtitle || '未設定'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">メインCTA</p>
            <p className="font-medium">{hero.ctaPrimaryText} → {hero.ctaPrimaryUrl}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">サブCTA</p>
            <p className="font-medium">
              {hero.ctaSecondaryText
                ? `${hero.ctaSecondaryText} → ${hero.ctaSecondaryUrl}`
                : '未設定'}
            </p>
          </div>
        </div>
      </section>

      {/* ページ一覧 */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">公開ページ</h2>
          <p className="text-sm text-muted-foreground">
            プライバシーポリシー、利用規約などのコンテンツページを編集します
          </p>
        </div>

        {pages.length === 0 ? (
          <div className="rounded-lg border bg-white p-12 text-center">
            <p className="text-muted-foreground">
              ページがありません。シードデータを実行してください。
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              <code>bun prisma/seed.ts --demo</code>
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>スラッグ</TableHead>
                  <TableHead>タイトル</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>更新日時</TableHead>
                  <TableHead className="w-24">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((page) => (
                  <TableRow key={page.id}>
                    <TableCell className="font-mono text-sm">
                      /{page.slug}
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
                    <TableCell>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/admin/pages/${page.slug}/edit`}>編集</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
