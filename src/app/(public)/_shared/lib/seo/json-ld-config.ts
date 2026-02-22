/**
 * JSON-LD構造化データ設定
 *
 * Settings DBから取得した設定を基にJSON-LD用データを生成
 * Next.js 16 use cache ディレクティブによる明示的キャッシュ制御
 */

import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { safeFetch, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors/server'
import { getBaseUrl, SITE_DEFAULTS, CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
import { isRecord, toPlainObject } from '@/shared/lib/serialize'

const BASE_URL = getBaseUrl()

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

interface OpeningHoursSpec {
  '@type': 'OpeningHoursSpecification'
  dayOfWeek: string | string[]
  opens: string
  closes: string
}

interface SpecialOpeningHoursSpec {
  '@type': 'OpeningHoursSpecification'
  validFrom: string
  validThrough: string
  opens: string
  closes: string
}

interface AmenityFeatureSpec {
  '@type': 'LocationFeatureSpecification'
  name: string
  value: boolean
}

export interface LocalBusinessJsonLdData {
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
  openingHoursSpecification?: OpeningHoursSpec[]
  specialOpeningHoursSpecification?: SpecialOpeningHoursSpec[]
  priceRange?: string
  geo?: {
    latitude: number
    longitude: number
  }
  hasMap?: string
  currenciesAccepted?: string
  paymentAccepted?: string
  foundingDate?: string
  additionalType?: string
  image?: string | string[]
  sameAs?: string[]
  amenityFeature?: AmenityFeatureSpec[]
}

/** @graph パターン用の統合データ */
export interface GraphJsonLdData {
  localBusiness: LocalBusinessJsonLdData
  webSite: WebSiteJsonLdData
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
  cacheLife(CACHE_LIFE.STATIC_SETTINGS)
  cacheTag(CACHE_TAGS.ORGANIZATION_SETTINGS, CACHE_TAGS.SETTINGS)

  const result = await safeFetch({
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
          // MEO fields
          businessHours: true,
          specialHolidays: true,
          latitude: true,
          longitude: true,
          priceRange: true,
          businessAttributes: true,
          paymentAccepted: true,
          establishedDate: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getOrganizationSettings',
  })
  return toPlainObject(result)
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
    name: settings?.siteName || SITE_DEFAULTS.name,
    description: settings?.siteDescription || SITE_DEFAULTS.description,
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
    name: settings?.businessName || settings?.siteName || SITE_DEFAULTS.name,
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

// =============================================================================
// LocalBusiness JSON-LD (MEO)
// =============================================================================

/** 曜日マッピング（フロントエンド表示でも再利用） */
export const DAY_MAP: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

/** 曜日の日本語表示ラベル */
export const DAY_LABELS: Record<string, string> = {
  monday: '月',
  tuesday: '火',
  wednesday: '水',
  thursday: '木',
  friday: '金',
  saturday: '土',
  sunday: '日',
}

/**
 * businessHours JSON → OpeningHoursSpecification 変換
 * 同じ時間帯の曜日をグループ化
 */
export function convertToOpeningHoursSpecification(
  businessHours: unknown
): OpeningHoursSpec[] | undefined {
  if (!isRecord(businessHours)) {
    return undefined
  }

  const hours = businessHours

  // 時間帯ごとに曜日をグループ化
  const groupMap = new Map<string, string[]>()

  for (const [dayKey, dayValue] of Object.entries(hours)) {
    const englishDay = DAY_MAP[dayKey]
    if (!englishDay) continue

    if (!isRecord(dayValue) || !dayValue['isOpen'] || !Array.isArray(dayValue['slots'])) continue

    for (const slot of dayValue['slots']) {
      if (!isRecord(slot) || typeof slot['openTime'] !== 'string' || typeof slot['closeTime'] !== 'string') continue
      const key = `${slot['openTime']}-${slot['closeTime']}`
      const existing = groupMap.get(key)
      if (existing) {
        existing.push(englishDay)
      } else {
        groupMap.set(key, [englishDay])
      }
    }
  }

  if (groupMap.size === 0) return undefined

  const specs: OpeningHoursSpec[] = []
  for (const [timeRange, days] of groupMap) {
    const [opens = '', closes = ''] = timeRange.split('-')
    const firstDay = days[0]
    if (!firstDay) continue
    specs.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: days.length === 1 ? firstDay : days,
      opens,
      closes,
    })
  }

  return specs.length > 0 ? specs : undefined
}

/**
 * specialHolidays JSON → specialOpeningHoursSpecification 変換
 * 休業日は opens/closes を "00:00" に設定（schema.org 公式パターン）
 */
function convertToSpecialOpeningHours(
  specialHolidays: unknown
): SpecialOpeningHoursSpec[] | undefined {
  if (!Array.isArray(specialHolidays)) return undefined

  const specs: SpecialOpeningHoursSpec[] = []

  for (const dateStr of specialHolidays) {
    if (typeof dateStr !== 'string') continue
    // ISO 8601 日付形式チェック: YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue

    specs.push({
      '@type': 'OpeningHoursSpecification',
      validFrom: dateStr,
      validThrough: dateStr,
      opens: '00:00',
      closes: '00:00',
    })
  }

  return specs.length > 0 ? specs : undefined
}

/** 施設属性ラベルマッピング（フロントエンド表示でも再利用） */
export const ATTR_LABELS: Record<string, string> = {
  wifi: 'Wi-Fi',
  parking: '駐車場',
  barrier_free: 'バリアフリー',
  elevator: 'エレベーター',
  smoking_area: '喫煙所',
  food_allowed: '飲食可',
  photography_allowed: '撮影可',
  music_allowed: '楽器演奏可',
}

/**
 * businessAttributes → amenityFeature 変換
 * value: true のもののみ出力
 */
function convertToAmenityFeatures(
  attrs: unknown
): AmenityFeatureSpec[] | undefined {
  if (!isRecord(attrs)) {
    return undefined
  }

  const record = attrs
  const features: AmenityFeatureSpec[] = []

  for (const [key, value] of Object.entries(record)) {
    if (value === true) {
      features.push({
        '@type': 'LocationFeatureSpecification',
        name: ATTR_LABELS[key] || key,
        value: true,
      })
    }
  }

  return features.length > 0 ? features : undefined
}

/**
 * sameAs用のSocialLink URLを取得
 */
async function getSocialLinkUrls(): Promise<string[]> {
  'use cache'
  cacheLife(CACHE_LIFE.STATIC_SETTINGS)
  cacheTag(CACHE_TAGS.SOCIAL_LINKS, CACHE_TAGS.SETTINGS)

  const links = await safeFetch({
    fetch: () =>
      prisma.socialLink.findMany({
        where: { isActive: true },
        select: { url: true },
        orderBy: { order: 'asc' },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getSocialLinkUrls',
  })

  return links.map((link) => link.url)
}

/**
 * LocalBusiness JSON-LD用データを取得
 */
export async function getLocalBusinessJsonLdData(): Promise<LocalBusinessJsonLdData> {
  const [settings, sameAs] = await Promise.all([
    getOrganizationSettings(),
    getSocialLinkUrls(),
  ])

  // 住所の構築
  const streetAddress = [
    settings?.streetAddress,
    settings?.buildingName,
  ]
    .filter(Boolean)
    .join(' ')

  const lat = settings?.latitude ?? null
  const lng = settings?.longitude ?? null

  // geo + hasMap: 緯度経度が両方設定されている場合のみ
  const geo = lat !== null && lng !== null
    ? { latitude: lat, longitude: lng }
    : undefined
  const hasMap = geo
    ? `https://www.google.com/maps?q=${geo.latitude},${geo.longitude}`
    : undefined

  // foundingDate: ISO 8601形式
  const foundingDate = settings?.establishedDate
    ? (new Date(settings.establishedDate).toISOString().split('T')[0] ?? undefined)
    : undefined

  return {
    name: settings?.businessName || settings?.siteName || SITE_DEFAULTS.name,
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
    openingHoursSpecification: convertToOpeningHoursSpecification(settings?.businessHours),
    specialOpeningHoursSpecification: convertToSpecialOpeningHours(settings?.specialHolidays),
    priceRange: settings?.priceRange || undefined,
    geo,
    hasMap,
    currenciesAccepted: 'JPY',
    paymentAccepted: settings?.paymentAccepted || undefined,
    foundingDate,
    additionalType: 'https://en.wikipedia.org/wiki/Coworking',
    image: settings?.headerLogoUrl ? [settings.headerLogoUrl] : undefined,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    amenityFeature: convertToAmenityFeatures(settings?.businessAttributes),
  }
}

/**
 * @graph パターン用の統合データを取得
 * LocalBusiness + WebSite を1つの JSON-LD で出力
 */
export async function getGraphJsonLdData(): Promise<GraphJsonLdData> {
  const [localBusiness, webSite] = await Promise.all([
    getLocalBusinessJsonLdData(),
    getWebSiteJsonLdData(),
  ])

  return { localBusiness, webSite }
}
