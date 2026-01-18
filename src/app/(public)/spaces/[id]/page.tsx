/**
 * スペース詳細ページ
 *
 * @description 動的ルーティングでスペースの詳細情報を表示
 *
 * Next.js 16 PPR対応:
 * - use cache ディレクティブでデータ取得をキャッシュ
 * - generateStaticParams でビルド時に事前生成
 */

import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/shared/lib/prisma'
import { Container } from '@/public/components/ui'
import { ProductJsonLd, BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { SpaceInfo } from './_components/SpaceInfo'
import { ImageGallery } from './_components/ImageGallery'
import { ReservationCTA } from './_components/ReservationCTA'
import { parseStringArray } from '@/shared/lib/json-validators'
import type { ReactElement } from 'react'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://example.com'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * スペース詳細を取得（キャッシュ付き）
 * idをキャッシュキーとして使用
 */
async function getSpaceById(id: string) {
  'use cache'
  cacheLife('hours')
  cacheTag('spaces', `space-${id}`)

  return await prisma.space.findUnique({
    where: {
      id,
      isPublished: true,
      isActive: true,
    },
    include: {
      location: {
        select: {
          id: true,
          name: true,
          address: true,
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          icon: true,
          color: true,
        },
      },
    },
  })
}

/**
 * メタデータ用スペース情報を取得（キャッシュ付き）
 */
async function getSpaceForMetadata(id: string) {
  'use cache'
  cacheLife('hours')
  cacheTag('spaces', `space-${id}`)

  return await prisma.space.findUnique({
    where: { id },
    select: { name: true, description: true, mainImageUrl: true },
  })
}

/**
 * 静的パラメータ生成
 * 公開中のスペースをビルド時に事前生成
 */
export async function generateStaticParams() {
  'use cache'
  cacheLife('hours')
  cacheTag('spaces')

  try {
    const spaces = await prisma.space.findMany({
      where: {
        isPublished: true,
        isActive: true,
      },
      select: { id: true },
      take: 100,
    })

    if (spaces.length === 0) {
      return [{ id: '__placeholder__' }]
    }

    return spaces.map((space) => ({
      id: space.id,
    }))
  } catch {
    return [{ id: '__placeholder__' }]
  }
}

/**
 * HTMLタグを除去してプレーンテキストを取得
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

/**
 * 動的メタデータ生成
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params
  const space = await getSpaceForMetadata(id)

  if (!space) {
    return {
      title: 'スペースが見つかりません',
    }
  }

  // HTMLタグを除去したプレーンテキストを取得
  const plainDescription = stripHtmlTags(space.description)
  const truncatedDescription =
    plainDescription.length > 160
      ? plainDescription.slice(0, 157) + '...'
      : plainDescription

  return {
    title: space.name,
    description: truncatedDescription,
    openGraph: {
      title: space.name,
      description: truncatedDescription,
      images: [{ url: space.mainImageUrl }],
    },
  }
}

export default async function SpaceDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { id } = await params

  // プレースホルダーの場合は404
  if (id === '__placeholder__') {
    notFound()
  }

  const space = await getSpaceById(id)

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
                location={space.location}
                category={space.category}
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
