'use server'

import { prisma } from '@/shared/lib/prisma'
import { cacheLife, cacheTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import {
  parseBusinessHours,
  parseStringArrayOrNull,
  type BusinessHours,
} from '@/shared/lib/json-validators'
import {
  type TaxSettings,
  DEFAULT_TAX_SETTINGS,
  getTaxDisplayModeOrDefault,
  getTaxInputModeOrDefault,
} from '@/shared/lib/pricing'
import type { LayoutWidth } from '@/shared/generated/prisma/enums'

// =============================================================================
// Types
// =============================================================================

export type PublicSettingsData = {
  id: string
  // Site Basic Info
  siteName: string | null
  siteDescription: string | null
  faviconUrl: string | null
  defaultOgpImageUrl: string | null
  headerLogoUrl: string | null
  footerCopyright: string | null
  // Business Info
  businessName: string | null
  businessNameKana: string | null
  representativeName: string | null
  businessType: string | null
  industryType: string | null
  establishedDate: Date | null
  registrationNumber: string | null
  invoiceNumber: string | null
  businessDescription: string | null
  // Contact Info
  phoneNumber: string | null
  faxNumber: string | null
  email: string | null
  address: string | null
  postalCode: string | null
  prefecture: string | null
  city: string | null
  streetAddress: string | null
  buildingName: string | null
  // Business Hours
  businessHours: BusinessHours | null
  regularHolidays: string[] | null
  specialHolidays: string[] | null
  holidayNotice: string | null
  // Layout Width Settings
  containerWidth: LayoutWidth | null
  containerWidthCustom: number | null
  contentWidth: LayoutWidth | null
  contentWidthCustom: number | null
  createdAt: Date
  updatedAt: Date
}

// =============================================================================
// Actions
// =============================================================================

/**
 * 規約同意設定を取得（公開サイト用・認証不要・キャッシュ付き）
 */
export async function getTermsAgreementSettings(): Promise<{
  enabled: boolean
  text: string | null
  requireTerms: boolean
  requirePrivacy: boolean
}> {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.SETTINGS)

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      termsAgreementEnabled: true,
      termsAgreementText: true,
      requireTermsAgreement: true,
      requirePrivacyAgreement: true,
    },
  })

  if (!settings) {
    return {
      enabled: true,
      text: null,
      requireTerms: true,
      requirePrivacy: true,
    }
  }

  return {
    enabled: settings.termsAgreementEnabled,
    text: settings.termsAgreementText,
    requireTerms: settings.requireTermsAgreement,
    requirePrivacy: settings.requirePrivacyAgreement,
  }
}

/**
 * 設定を取得（公開ページ用・認証不要・キャッシュ付き）
 * 機密情報は含まない
 */
export async function getPublicSettings(): Promise<PublicSettingsData> {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.SETTINGS)

  let settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
  })

  if (!settings) {
    settings = await prisma.settings.create({
      data: { id: 'singleton' },
    })
  }

  return {
    id: settings.id,
    // Site Basic Info
    siteName: settings.siteName,
    siteDescription: settings.siteDescription,
    faviconUrl: settings.faviconUrl,
    defaultOgpImageUrl: settings.defaultOgpImageUrl,
    headerLogoUrl: settings.headerLogoUrl,
    footerCopyright: settings.footerCopyright,
    // Business Info
    businessName: settings.businessName,
    businessNameKana: settings.businessNameKana,
    representativeName: settings.representativeName,
    businessType: settings.businessType,
    industryType: settings.industryType,
    establishedDate: settings.establishedDate,
    registrationNumber: settings.registrationNumber,
    invoiceNumber: settings.invoiceNumber,
    businessDescription: settings.businessDescription,
    // Contact Info
    phoneNumber: settings.phoneNumber,
    faxNumber: settings.faxNumber,
    email: settings.email,
    address: settings.address,
    postalCode: settings.postalCode,
    prefecture: settings.prefecture,
    city: settings.city,
    streetAddress: settings.streetAddress,
    buildingName: settings.buildingName,
    // Business Hours
    businessHours: parseBusinessHours(settings.businessHours),
    regularHolidays: parseStringArrayOrNull(settings.regularHolidays),
    specialHolidays: parseStringArrayOrNull(settings.specialHolidays),
    holidayNotice: settings.holidayNotice,
    // Layout Width Settings
    containerWidth: settings.containerWidth,
    containerWidthCustom: settings.containerWidthCustom,
    contentWidth: settings.contentWidth,
    contentWidthCustom: settings.contentWidthCustom,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  }
}


/**
 * パーマリンク設定の型
 */
export type PermalinkSettings = {
  structure: 'post-name' | 'simple' | 'date-name' | 'category-name'
  prefix: string
}

const VALID_PERMALINK_STRUCTURES = new Set<string>([
  'post-name',
  'simple',
  'date-name',
  'category-name',
])

/**
 * パーマリンク構造の型ガード
 */
function isValidPermalinkStructure(value: unknown): value is PermalinkSettings['structure'] {
  return typeof value === 'string' && VALID_PERMALINK_STRUCTURES.has(value)
}

/**
 * パーマリンク設定を取得（公開サイト用・認証不要・キャッシュ付き）
 */
export async function getPermalinkSettings(): Promise<PermalinkSettings> {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.SETTINGS)

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      blogPermalinkStructure: true,
      blogUrlPrefix: true,
    },
  })

  const rawStructure = settings?.blogPermalinkStructure
  const structure = isValidPermalinkStructure(rawStructure) ? rawStructure : 'post-name'

  return {
    structure,
    prefix: settings?.blogUrlPrefix ?? 'blog',
  }
}

/**
 * 税設定を取得（公開サイト用・認証不要・キャッシュ付き）
 */
export async function getPublicTaxSettings(): Promise<TaxSettings> {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.SETTINGS)

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      taxStandardRate: true,
      taxReducedRate: true,
      taxDisplayModeAdmin: true,
      taxDisplayModePublic: true,
      taxInputMode: true,
    },
  })

  if (!settings) {
    return DEFAULT_TAX_SETTINGS
  }

  return {
    standardRate: Number(settings.taxStandardRate),
    reducedRate: Number(settings.taxReducedRate),
    displayModeAdmin: getTaxDisplayModeOrDefault(settings.taxDisplayModeAdmin),
    displayModePublic: getTaxDisplayModeOrDefault(settings.taxDisplayModePublic, 'tax_included'),
    inputMode: getTaxInputModeOrDefault(settings.taxInputMode),
  }
}

/**
 * ページコンテンツ取得用の結果型
 */
export type PageContentResult = {
  title: string
  content: string
} | null

/**
 * ページコンテンツを取得（公開ページ用・認証不要・キャッシュ付き）
 * ダイアログ表示用にタイトルとコンテンツのみ返す
 */
export async function getPageContent(slug: string): Promise<PageContentResult> {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.PAGES)

  const page = await prisma.page.findUnique({
    where: {
      slug,
      isPublished: true,
      isActive: true,
    },
    select: {
      title: true,
      content: true,
    },
  })

  if (!page || !page.content) {
    return null
  }

  return {
    title: page.title,
    content: page.content,
  }
}

/**
 * Turnstile Site Key を取得（公開ページ用・認証不要・キャッシュ付き）
 *
 * クライアントに渡すSite Keyのみを返します。
 * Secret Keyは絶対に公開しないこと。
 */
export async function getTurnstileSiteKey(): Promise<string | null> {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.SETTINGS)

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      turnstileSiteKey: true,
    },
  })

  return settings?.turnstileSiteKey ?? null
}
