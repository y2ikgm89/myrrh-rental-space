'use server'

import { prisma } from '@/shared/lib/prisma'
import {
  parseBusinessHours,
  parseStringArrayOrNull,
} from '@/shared/lib/json-validators'
import type { LayoutWidth } from '@/shared/generated/prisma/enums'

// =============================================================================
// Types
// =============================================================================

// 営業時間の型定義
export type BusinessHoursDay = {
  isOpen: boolean
  openTime: string | null
  closeTime: string | null
}

export type BusinessHours = {
  monday: BusinessHoursDay
  tuesday: BusinessHoursDay
  wednesday: BusinessHoursDay
  thursday: BusinessHoursDay
  friday: BusinessHoursDay
  saturday: BusinessHoursDay
  sunday: BusinessHoursDay
}

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
 * 規約同意設定を取得（公開サイト用・認証不要）
 */
export async function getTermsAgreementSettings(): Promise<{
  enabled: boolean
  text: string | null
  requireTerms: boolean
  requirePrivacy: boolean
}> {
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
 * 設定を取得（公開ページ用・認証不要）
 * 機密情報は含まない
 */
export async function getPublicSettings(): Promise<PublicSettingsData> {
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
 * ページコンテンツ取得用の結果型
 */
export type PageContentResult = {
  title: string
  content: string
} | null

/**
 * ページコンテンツを取得（公開ページ用・認証不要）
 * ダイアログ表示用にタイトルとコンテンツのみ返す
 */
export async function getPageContent(slug: string): Promise<PageContentResult> {
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
