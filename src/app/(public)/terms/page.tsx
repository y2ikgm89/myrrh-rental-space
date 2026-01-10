/**
 * 利用規約ページ
 *
 * @description レンタルスペースサービスの利用規約を表示（DBから取得）
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { tv } from 'tailwind-variants'
import { Container } from '@/components/site/ui'
import { SafeHtml } from '@/components/site/SafeHtml'
import { getPageForPublic } from '@/actions/admin/page'
import type { ReactElement } from 'react'

const styles = tv({
  slots: {
    section: 'py-16 bg-background min-h-screen',
    header: 'mb-12 text-center',
    title: 'text-3xl font-bold tracking-tight text-foreground',
    lastUpdated: 'mt-2 text-sm text-muted-foreground',
  },
})()

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageForPublic('terms')

  if (!page) {
    return {
      title: '利用規約',
    }
  }

  return {
    title: page.title,
    description: page.metaDescription || page.description,
    openGraph: {
      title: page.ogpTitle || page.title,
      description: page.ogpDescription || page.metaDescription || page.description || undefined,
      images: page.ogpImageUrl ? [page.ogpImageUrl] : undefined,
    },
  }
}

export default async function TermsOfServicePage(): Promise<ReactElement> {
  const page = await getPageForPublic('terms')

  if (!page) {
    notFound()
  }

  return (
    <section className={styles.section()}>
      <Container size="md">
        <header className={styles.header()}>
          <h1 className={styles.title()}>{page.title}</h1>
          <p className={styles.lastUpdated()}>
            最終更新日:{' '}
            {new Date(page.updatedAt).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </header>

        <SafeHtml html={page.content} />
      </Container>
    </section>
  )
}
