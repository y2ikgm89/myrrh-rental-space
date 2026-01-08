/**
 * スペース詳細ページ
 *
 * @description 動的ルーティングでスペースの詳細情報を表示
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Container } from '@/components/site/ui'
import { SpaceInfo } from './_components/SpaceInfo'
import { ImageGallery } from './_components/ImageGallery'
import { ReservationCTA } from './_components/ReservationCTA'
import type { ReactElement } from 'react'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * 動的メタデータ生成
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params
  const space = await prisma.space.findUnique({
    where: { id },
    select: { name: true, description: true, mainImageUrl: true },
  })

  if (!space) {
    return {
      title: 'スペースが見つかりません',
    }
  }

  return {
    title: space.name,
    description:
      space.description.length > 160
        ? space.description.slice(0, 157) + '...'
        : space.description,
    openGraph: {
      title: space.name,
      description: space.description,
      images: [{ url: space.mainImageUrl }],
    },
  }
}

/**
 * 静的パラメータ生成（ビルド時の最適化）
 */
export async function generateStaticParams(): Promise<{ id: string }[]> {
  const spaces = await prisma.space.findMany({
    where: { isPublished: true, isActive: true },
    select: { id: true },
    take: 100, // 最大100件まで事前生成
  })

  return spaces.map((space) => ({ id: space.id }))
}

export default async function SpaceDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { id } = await params

  const space = await prisma.space.findUnique({
    where: {
      id,
      isPublished: true,
      isActive: true,
    },
  })

  if (!space) {
    notFound()
  }

  // imageUrls を配列として取得
  const imageUrls = Array.isArray(space.imageUrls)
    ? (space.imageUrls as string[])
    : []

  // facilities を配列として取得
  const facilities = Array.isArray(space.facilities)
    ? (space.facilities as string[])
    : []

  return (
    <section className="py-16 bg-background min-h-screen">
      <Container>
        {/* 画像ギャラリー */}
        <ImageGallery
          mainImageUrl={space.mainImageUrl}
          imageUrls={imageUrls}
          spaceName={space.name}
        />

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          {/* スペース情報（2カラム） */}
          <div className="lg:col-span-2">
            <SpaceInfo
              name={space.name}
              description={space.description}
              address={space.address}
              access={space.access}
              capacity={space.capacity}
              area={space.area ? Number(space.area) : null}
              facilities={facilities}
            />
          </div>

          {/* 予約CTA（1カラム） */}
          <div className="lg:col-span-1">
            <ReservationCTA
              spaceId={space.id}
              spaceName={space.name}
              hourlyPrice={Number(space.hourlyPrice)}
              dailyPrice={space.dailyPrice ? Number(space.dailyPrice) : null}
            />
          </div>
        </div>
      </Container>
    </section>
  )
}
