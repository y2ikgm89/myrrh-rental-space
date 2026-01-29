/**
 * ページセクション管理画面
 */

import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { getPageWithSections } from '@/admin/actions/page-section'
import { PageSectionsManager } from './_components/PageSectionsManager'
import type { Metadata } from 'next'
import type { ReactElement } from 'react'

type PageParams = Promise<{ slug: string }>

type PageProps = {
  params: PageParams
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await connection()
  const { slug } = await params
  const page = await getPageWithSections(slug)

  return {
    title: page ? `${page.title} - セクション管理` : 'セクション管理',
  }
}

export default async function PageSectionsPage({ params }: PageProps): Promise<ReactElement> {
  await connection()
  const { slug } = await params

  const page = await getPageWithSections(slug)

  if (!page) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{page.title}</h1>
          <p className="text-muted-foreground">セクションを管理</p>
        </div>
      </div>

      <PageSectionsManager
        pageId={page.id}
        pageSlug={page.slug}
      />
    </div>
  )
}
