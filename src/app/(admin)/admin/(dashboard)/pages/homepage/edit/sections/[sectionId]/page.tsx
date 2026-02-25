/**
 * ホームページセクション編集ページ
 *
 * 専用ルートでセクション設定を編集。
 * ヘッダー重複を解消するために HomepageTab 内のインライン表示から分離。
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getHomepageSection } from '@/admin/actions/homepage-settings'
import { sectionTypeLabels } from '@/admin/lib/validations/homepage-section'
import { toPlainObject } from '@/shared/lib/serialize'
import { Button, Breadcrumb } from '@/admin/components/ui'
import { SectionEditWrapper } from './_components/SectionEditWrapper'
import type { Metadata } from 'next'
import type { ReactElement } from 'react'

export const metadata: Metadata = {
  title: 'セクション編集',
}

interface PageProps {
  params: Promise<{ sectionId: string }>
}

export default async function HomepageSectionEditPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();
  await connection()

  const { sectionId } = await params
  const section = await getHomepageSection(sectionId)

  if (!section) notFound()

  const label = sectionTypeLabels[section.type]

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'ページ管理', href: '/admin/pages' },
          { label: 'ホームページ', href: '/admin/pages/homepage/edit' },
          { label: `${section.title || label}の設定` },
        ]}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link href="/admin/pages/homepage/edit?tab=sections">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {section.title || label}の設定
            </h1>
            <p className="text-muted-foreground">{label}</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-1" />
            プレビュー
          </a>
        </Button>
      </div>

      <SectionEditWrapper section={toPlainObject(section)} />
    </div>
  )
}
