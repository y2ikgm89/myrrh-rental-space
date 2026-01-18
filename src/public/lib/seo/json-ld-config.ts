/**
 * JSON-LD構造化データ設定
 *
 * Settings DBから取得した設定を基にJSON-LD用データを生成
 * Next.js 16 use cache ディレクティブによる明示的キャッシュ制御
 */

import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { safeFetch, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://example.com'

// =============================================================================
// Types
// =============================================================================

export interface WebSiteJsonLdData {
  name: string
  description: string
  url: string
}

export interface OrganizationJsonLdData {
  name: string
  description?: string
  url: string
  logo?: string
  telephone?: string
  email?: string
  address?: {
    streetAddress?: string
    addressLocality?: string
    addressRegion?: string
    postalCode?: string
    addressCountry?: string
  }
}

// =============================================================================
// Data Fetching
// =============================================================================

/**
 * JSON-LD用組織設定を取得
 * キャッシュ: 1時間、設定更新時に無効化
 */
async function getOrganizationSettings() {
  'use cache'
  cacheLife('hours')
  cacheTag('organization-settings', 'settings')

  return safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: 'singleton' },
        select: {
          siteName: true,
          siteDescription: true,
          businessName: true,
          businessDescription: true,
          headerLogoUrl: true,
          phoneNumber: true,
          email: true,
          postalCode: true,
          prefecture: true,
          city: true,
          streetAddress: true,
          buildingName: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getOrganizationSettings',
  })
}

// =============================================================================
// JSON-LD Data Generators
// =============================================================================

/**
 * WebSite JSON-LD用データを取得
 */
export async function getWebSiteJsonLdData(): Promise<WebSiteJsonLdData> {
  const settings = await getOrganizationSettings()

  return {
    name: settings?.siteName || 'Myrrh Rental Space',
    description:
      settings?.siteDescription || 'レンタルスペースの予約・管理サービス',
    url: BASE_URL,
  }
}

/**
 * Organization JSON-LD用データを取得
 */
export async function getOrganizationJsonLdData(): Promise<OrganizationJsonLdData> {
  const settings = await getOrganizationSettings()

  // 住所の構築
  const streetAddress = [
    settings?.streetAddress,
    settings?.buildingName,
  ]
    .filter(Boolean)
    .join(' ')

  return {
    name: settings?.businessName || settings?.siteName || 'Myrrh Rental Space',
    description: settings?.businessDescription || settings?.siteDescription || undefined,
    url: BASE_URL,
    logo: settings?.headerLogoUrl || undefined,
    telephone: settings?.phoneNumber || undefined,
    email: settings?.email || undefined,
    address:
      settings?.postalCode || settings?.prefecture
        ? {
            postalCode: settings?.postalCode || undefined,
            addressRegion: settings?.prefecture || undefined,
            addressLocality: settings?.city || undefined,
            streetAddress: streetAddress || undefined,
            addressCountry: 'JP',
          }
        : undefined,
  }
}
