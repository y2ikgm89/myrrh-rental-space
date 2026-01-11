/**
 * スペース詳細ページ
 *
 * @description 動的ルーティングでスペースの詳細情報を表示
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Container } from '@/components/site/ui'
import { ProductJsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import { SpaceInfo } from './_components/SpaceInfo'
import { ImageGallery } from './_components/ImageGallery'
import { ReservationCTA } from './_components/ReservationCTA'
import { parseStringArray } from '@/lib/json-validators'
import type { ReactElement } from 'react'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://example.com'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * 静的パラメータ生成
 * 公開中のスペースをビルド時に事前生成
 */
export async function generateStaticParams() {
  const spaces = await prisma.space.findMany({
    where: {
      isPublished: true,
      isActive: true,
    },
    select: { id: true },
  })

  return spaces.map((space) => ({
    id: space.id,
  }))
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
  const imageUrls = parseStringArray(space.imageUrls)

  // facilities を配列として取得
  const facilities = parseStringArray(space.facilities)

  return (
    <>
      {/* JSON-LD構造化データ */}
      <ProductJsonLd
        name={space.name}
        description={space.description}
        image={space.mainImageUrl}
        url={`${BASE_URL}/spaces/${space.id}`}
        offers={{
          price: Number(space.hourlyPrice),
          priceCurrency: 'JPY',
        }}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: 'スペース一覧', url: '/spaces' },
          { name: space.name, url: `/spaces/${space.id}` },
        ]}
      />

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
    </>
  )
}
