/**
 * 予約ページ
 *
 * @description スペースを予約するためのページ
 * - カレンダーで日付選択
 * - 時間枠選択
 * - 顧客情報入力
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Container } from '@/components/site/ui'
import { ReservationForm } from './_components'
import type { ReactElement } from 'react'

interface PageProps {
  searchParams: Promise<{ spaceId?: string }>
}

export const metadata: Metadata = {
  title: '予約',
  description: 'レンタルスペースのご予約はこちらから。日時を選択して、簡単にご予約いただけます。',
}

export default async function ReservationPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  const { spaceId } = await searchParams

  // spaceId が指定されていない場合はスペース選択画面へ誘導
  if (!spaceId) {
    return (
      <section className="py-16 bg-background min-h-screen">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              予約するスペースを選択してください
            </h1>
            <p className="text-muted-foreground mb-8">
              予約したいスペースの詳細ページから「予約する」ボタンをクリックしてください。
            </p>
            <Link
              href="/spaces"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
            >
              スペース一覧を見る
            </Link>
          </div>
        </Container>
      </section>
    )
  }

  // スペース情報を取得
  const space = await prisma.space.findUnique({
    where: {
      id: spaceId,
      isPublished: true,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      hourlyPrice: true,
      mainImageUrl: true,
    },
  })

  if (!space) {
    notFound()
  }

  return (
    <section className="py-16 bg-background min-h-screen">
      <Container>
        {/* ページヘッダー */}
        <div className="max-w-4xl mx-auto mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            予約
          </h1>
          <p className="text-muted-foreground">
            {space.name} のご予約
          </p>
        </div>

        {/* 予約フォーム */}
        <ReservationForm
          spaceId={space.id}
          spaceName={space.name}
          hourlyPrice={Number(space.hourlyPrice)}
        />
      </Container>
    </section>
  )
}
