/**
 * スペース詳細ページ
 *
 * レンタルスペースの詳細情報を表示するServer Component。
 *
 * ## 機能
 * - スペース情報の詳細表示
 * - 画像ギャラリー
 * - 予約CTA（料金表示・予約リンク）
 * - 構造化データ（Product, Breadcrumb JSON-LD）の出力
 *
 * ## Next.js 16 PPR対応
 * - `use cache` ディレクティブでデータ取得をキャッシュ
 * - `generateStaticParams` でビルド時に事前生成
 *
 * @module spaces/[slug]/page
 */

import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/shared/lib/prisma'
import { criticalFetch, ErrorCategory } from '@/shared/lib/errors'
import { toPlainObject } from '@/shared/lib/serialize'
import { Container } from '@/public/components/ui'
import { ProductJsonLd, BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { SpaceInfo } from './_components/SpaceInfo'
import { ImageGallery } from './_components/ImageGallery'
import { ReservationCTA } from './_components/ReservationCTA'
import { parseStringArray, parseTaxRateType } from '@/shared/lib/json-validators'
import { getBaseUrl, CACHE_LIFE, CACHE_TAGS } from '@/shared/lib/constants'
import { getPublicTaxSettings } from '@/public/actions/settings'
import type { ReactElement } from 'react'

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = getBaseUrl()

// =============================================================================
// Types
// =============================================================================

/** ページコンポーネントのProps */
interface PageProps {
  params: Promise<{ slug: string }>
}

// =============================================================================
// Data Fetching
// =============================================================================

/**
 * スペース詳細を取得（キャッシュ付き）
 *
 * 公開中のスペース情報を取得し、シリアライズして返します。
 * 関連するロケーションとカテゴリ情報も含めて取得します。
 *
 * @param slug - スペースのスラッグ
 * @returns スペースデータ、存在しない場合は null
 * @throws criticalFetch 内でDBエラーをログ出力
 */
async function getSpaceBySlug(slug: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.SPACES, `${CACHE_TAGS.SPACES}-slug-${slug}`)

  const result = await criticalFetch({
    fetch: () =>
      prisma.space.findUnique({
        where: {
          slug,
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
      }),
    category: ErrorCategory.DATABASE,
    operationName: 'getSpaceBySlug',
    context: { spaceSlug: slug },
  })

  return toPlainObject(result)
}

/**
 * メタデータ用スペース情報を取得（キャッシュ付き）
 *
 * generateMetadata で使用する最小限の情報のみ取得します。
 *
 * @param slug - スペースのスラッグ
 * @returns メタデータ用情報、存在しない場合は null
 * @throws criticalFetch 内でDBエラーをログ出力
 */
async function getSpaceForMetadata(slug: string) {
  'use cache'
  cacheLife(CACHE_LIFE.METADATA)
  cacheTag(CACHE_TAGS.SPACES, `${CACHE_TAGS.SPACES}-slug-${slug}`)

  const result = await criticalFetch({
    fetch: () =>
      prisma.space.findUnique({
        where: { slug },
        select: { name: true, description: true, mainImageUrl: true },
      }),
    category: ErrorCategory.DATABASE,
    operationName: 'getSpaceForMetadata',
    context: { spaceSlug: slug },
  })

  return toPlainObject(result)
}

// =============================================================================
// Static Generation
// =============================================================================

/**
 * 静的パラメータ生成
 *
 * ビルド時に公開中のスペースページを事前生成します。
 * 最大100件まで事前生成し、それ以降はオンデマンドで生成されます。
 *
 * @returns スペースslugの配列
 */
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.SPACES)

  try {
    const spaces = await prisma.space.findMany({
      where: {
        isPublished: true,
        isActive: true,
      },
      select: { slug: true },
      take: 100,
    })

    if (spaces.length === 0) {
      return [{ slug: '__placeholder__' }]
    }

    return spaces.map((space) => ({
      slug: space.slug,
    }))
  } catch {
    return [{ slug: '__placeholder__' }]
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * HTMLタグを除去してプレーンテキストを取得
 *
 * @param html - HTMLを含む文字列
 * @returns タグを除去したプレーンテキスト
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

// =============================================================================
// Metadata
// =============================================================================

/**
 * 動的メタデータ生成
 *
 * スペースの名前と説明からメタデータを生成します。
 * 説明からHTMLタグを除去し、160文字に切り詰めて description として使用します。
 *
 * @param props - ページProps（params含む）
 * @returns Next.js Metadata オブジェクト
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params
  const space = await getSpaceForMetadata(slug)

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

// =============================================================================
// Page Component
// =============================================================================

/**
 * スペース詳細ページコンポーネント
 *
 * レンタルスペースの詳細情報を表示するServer Component。
 * 画像ギャラリー、スペース情報、予約CTAを含みます。
 *
 * @param props - ページProps（params含む）
 * @returns ページのReact要素
 */
export default async function SpaceDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { slug } = await params

  // プレースホルダーの場合は404
  if (slug === '__placeholder__') {
    notFound()
  }

  const [space, taxSettings] = await Promise.all([
    getSpaceBySlug(slug),
    getPublicTaxSettings(),
  ])

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
        url={`${BASE_URL}/spaces/${space.slug}`}
        offers={{
          price: Number(space.hourlyPrice),
          priceCurrency: 'JPY',
        }}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: '/' },
          { name: 'スペース一覧', url: '/spaces' },
          { name: space.name, url: `/spaces/${space.slug}` },
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
                taxSettings={taxSettings}
                taxRateType={parseTaxRateType(space.taxRateType)}
              />
            </div>
          </div>
        </Container>
      </section>
    </>
  )
}
