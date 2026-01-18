'use server'

import { prisma, Prisma } from '@/shared/lib/prisma'
import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createSuccess, createFailure, withPermission, type ActionResult } from '@/admin/types/server-actions'
import { LayoutWidth } from '@/shared/generated/prisma/enums'
import { encrypt, safeDecrypt } from '@/shared/lib/crypto'
import {
  parseBusinessHours,
  parseStringArrayOrNull,
} from '@/shared/lib/json-validators'
import {
  maskSecretKey,
  testStripeConnection as testStripeConnectionLib,
} from '@/admin/lib/stripe'
import {
  testServiceAccountConnection,
  testOAuthConnection,
  encryptServiceAccountJson,
  extractServiceAccountEmail,
  isValidCalendarId,
  getGoogleCalendarSettings,
  setupWebhookWatch,
  stopWebhookWatch,
} from '@/shared/lib/google-calendar'
import { syncFromCalendar } from '@/shared/lib/calendar-sync'
import { stripeSettingsSchema, type StripeSettingsInput } from '@/admin/lib/validations/stripe'
import { sidebarSettingsSchema, type SidebarSettings } from '@/admin/lib/validations/sidebar'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logPermissionDenied } from '@/admin/lib/audit'

// =============================================================================
// Types
// =============================================================================

// 営業時間の型定義
export type BusinessHoursDay = {
  isOpen: boolean
  openTime: string | null  // "09:00"
  closeTime: string | null // "21:00"
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

export type SettingsData = {
  id: string
  // Site Basic Info
  siteName: string | null
  siteDescription: string | null
  faviconUrl: string | null
  defaultOgpImageUrl: string | null
  headerLogoUrl: string | null
  footerCopyright: string | null
  // Business Info (事業者情報)
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
  // Business Hours (営業時間)
  businessHours: BusinessHours | null
  regularHolidays: string[] | null
  specialHolidays: string[] | null
  holidayNotice: string | null
  defaultBusinessHours: BusinessHours | null
  // Email Settings
  senderEmail: string | null
  senderName: string | null
  replyToEmail: string | null
  // SEO Settings
  defaultMetaDescription: string | null
  defaultMetaKeywords: string | null
  defaultOgpTitle: string | null
  defaultOgpDescription: string | null
  // Analytics Settings
  analyticsType: string | null
  googleAnalyticsId: string | null
  googleTagManagerId: string | null
  googleSearchConsoleId: string | null
  bingWebmasterToolsId: string | null
  gaPropertyId: string | null
  // Reservation Settings
  defaultTimeSlot: number | null
  minReservationDuration: number | null
  maxReservationDuration: number | null
  cancellationPolicy: string | null
  sendReservationConfirmationEmail: boolean
  sendAdminNotificationEmail: boolean
  // Notification Settings
  notifyNewReservation: boolean
  notifyReservationChange: boolean
  notifyReservationCancel: boolean
  notifyNewInquiry: boolean
  notificationEmailAddresses: string | null
  // Terms Agreement Settings
  termsAgreementEnabled: boolean
  termsAgreementText: string | null
  requireTermsAgreement: boolean
  requirePrivacyAgreement: boolean
  // Other Settings
  timezone: string | null
  language: string | null
  maintenanceMode: boolean
  maintenanceMessage: string | null
  // Stripe Payment Settings
  stripeEnabled: boolean
  stripeTestMode: boolean
  stripePublishableKey: string | null
  stripeSecretKeyMasked: string | null  // マスク済み（復号しない）
  stripeWebhookSecretMasked: string | null  // マスク済み
  stripeAccountId: string | null
  stripeCurrency: string
  stripeLastTestedAt: Date | null
  stripeConnectionStatus: string | null
  // Cookie Consent Settings
  cookieConsentEnabled: boolean
  cookieConsentMessage: string | null
  cookieConsentAcceptText: string | null
  cookieConsentRejectText: string | null
  cookieConsentPolicyUrl: string | null
  // Announcement Bar Carousel Settings
  announcementBarAnimation: string
  announcementBarDuration: number
  announcementBarAutoPlay: boolean
  announcementBarPauseOnHover: boolean
  announcementBarShowArrows: boolean
  announcementBarShowIndicator: boolean
  announcementBarDesignStyle: string
  // Announcement Bar Common Color Settings
  announcementBarBgColor: string | null
  announcementBarTextColor: string | null
  // Striped Design Settings
  announcementBarStripeColor: string | null
  announcementBarStripeAnimation: boolean
  // Gradient Design Settings
  announcementBarGradientAnimation: boolean
  // Glass Design Settings
  announcementBarGlassAnimation: boolean
  // Google Calendar Integration
  googleCalendarEnabled: boolean
  googleCalendarId: string | null
  googleCalendarServiceAccountEmailMasked: string | null
  googleCalendarLastTestedAt: Date | null
  googleCalendarConnectionStatus: string | null
  googleCalendarOAuthEnabled: boolean
  icalAttachmentEnabled: boolean
  addToCalendarLinksEnabled: boolean
  // Two-Way Sync Settings
  googleCalendarTwoWaySyncEnabled: boolean
  googleCalendarSyncMethod: string
  googleCalendarPollingIntervalMin: number
  googleCalendarLastSyncedAt: Date | null
  googleCalendarWebhookActive: boolean
  googleCalendarWebhookExpiration: Date | null
  // Layout Width Settings
  containerWidth: LayoutWidth | null
  containerWidthCustom: number | null
  contentWidth: LayoutWidth | null
  contentWidthCustom: number | null
  // Sidebar Settings
  sidebarEnabled: boolean
  sidebarWidgets: unknown // JSON型（SidebarWidgetsとしてパース）
  sidebarRecentCount: number
  sidebarPopularCount: number
  createdAt: Date
  updatedAt: Date
}

// =============================================================================
// Schemas
// =============================================================================

const basicInfoSchema = z.object({
  siteName: z.string().max(100).nullable(),
  siteDescription: z.string().max(500).nullable(),
  faviconUrl: z.string().max(500).nullable(),
  defaultOgpImageUrl: z.string().max(500).nullable(),
  headerLogoUrl: z.string().max(500).nullable(),
  footerCopyright: z.string().max(200).nullable(),
})

const businessInfoSchema = z.object({
  businessName: z.string().max(100).nullable(),
  businessNameKana: z.string().max(100).nullable(),
  representativeName: z.string().max(50).nullable(),
  businessType: z.string().max(50).nullable(),
  industryType: z.string().max(50).nullable(),
  establishedDate: z.string().nullable(),
  registrationNumber: z.string().max(50).nullable(),
  invoiceNumber: z.string().max(20).nullable(),
  businessDescription: z.string().max(2000).nullable(),
})

const contactInfoSchema = z.object({
  phoneNumber: z.string().max(20).nullable(),
  faxNumber: z.string().max(20).nullable(),
  email: z.string().email().max(100).nullable().or(z.literal('')),
  address: z.string().max(500).nullable(),
  postalCode: z.string().max(10).nullable(),
  prefecture: z.string().max(10).nullable(),
  city: z.string().max(50).nullable(),
  streetAddress: z.string().max(100).nullable(),
  buildingName: z.string().max(100).nullable(),
})

const businessHoursDaySchema = z.object({
  isOpen: z.boolean(),
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
})

const businessHoursSettingsSchema = z.object({
  businessHours: z.object({
    monday: businessHoursDaySchema,
    tuesday: businessHoursDaySchema,
    wednesday: businessHoursDaySchema,
    thursday: businessHoursDaySchema,
    friday: businessHoursDaySchema,
    saturday: businessHoursDaySchema,
    sunday: businessHoursDaySchema,
  }),
  regularHolidays: z.array(z.string()).nullable(),
  specialHolidays: z.array(z.string()).nullable(),
  holidayNotice: z.string().max(1000).nullable(),
})

const seoSettingsSchema = z.object({
  defaultMetaDescription: z.string().max(160).nullable(),
  defaultMetaKeywords: z.string().max(500).nullable(),
  defaultOgpTitle: z.string().max(60).nullable(),
  defaultOgpDescription: z.string().max(160).nullable(),
  // Analytics Settings
  analyticsType: z.enum(['ga4', 'gtm']).nullable(),
  googleAnalyticsId: z.string().max(50).nullable(),
  googleTagManagerId: z.string().max(50).nullable(),
  googleSearchConsoleId: z.string().max(100).nullable(),
  bingWebmasterToolsId: z.string().max(100).nullable(),
  gaPropertyId: z.string().max(20).nullable(),
})

const emailSettingsSchema = z.object({
  senderEmail: z.string().email().max(100).nullable().or(z.literal('')),
  senderName: z.string().max(100).nullable(),
  replyToEmail: z.string().email().max(100).nullable().or(z.literal('')),
  sendReservationConfirmationEmail: z.boolean(),
  sendAdminNotificationEmail: z.boolean(),
  notificationEmailAddresses: z.string().max(500).nullable(),
})

const reservationSettingsSchema = z.object({
  defaultTimeSlot: z.number().int().min(15).max(240).nullable(),
  minReservationDuration: z.number().int().min(15).max(480).nullable(),
  maxReservationDuration: z.number().int().min(60).max(1440).nullable(),
  cancellationPolicy: z.string().max(2000).nullable(),
})

const notificationSettingsSchema = z.object({
  notifyNewReservation: z.boolean(),
  notifyReservationChange: z.boolean(),
  notifyReservationCancel: z.boolean(),
  notifyNewInquiry: z.boolean(),
})

const maintenanceSettingsSchema = z.object({
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().max(1000).nullable(),
})

const termsAgreementSettingsSchema = z.object({
  termsAgreementEnabled: z.boolean(),
  termsAgreementText: z.string().max(500).nullable(),
  requireTermsAgreement: z.boolean(),
  requirePrivacyAgreement: z.boolean(),
})

const cookieConsentSettingsSchema = z.object({
  cookieConsentEnabled: z.boolean(),
  cookieConsentMessage: z.string().max(1000).nullable(),
  cookieConsentAcceptText: z.string().max(50).nullable(),
  cookieConsentRejectText: z.string().max(50).nullable(),
  cookieConsentPolicyUrl: z.string().max(200).nullable(),
})

export type BasicInfoInput = z.infer<typeof basicInfoSchema>
export type BusinessInfoInput = z.infer<typeof businessInfoSchema>
export type ContactInfoInput = z.infer<typeof contactInfoSchema>
export type BusinessHoursSettingsInput = z.infer<typeof businessHoursSettingsSchema>
export type SeoSettingsInput = z.infer<typeof seoSettingsSchema>
export type EmailSettingsInput = z.infer<typeof emailSettingsSchema>
export type ReservationSettingsInput = z.infer<typeof reservationSettingsSchema>
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>
export type MaintenanceSettingsInput = z.infer<typeof maintenanceSettingsSchema>
export type TermsAgreementSettingsInput = z.infer<typeof termsAgreementSettingsSchema>
export type CookieConsentSettingsInput = z.infer<typeof cookieConsentSettingsSchema>

// Layout Settings Schema
const layoutSettingsSchema = z.object({
  containerWidth: z.nativeEnum(LayoutWidth),
  containerWidthCustom: z.number().int().min(320).max(2560).nullable(),
  contentWidth: z.nativeEnum(LayoutWidth),
  contentWidthCustom: z.number().int().min(320).max(1920).nullable(),
})

export type LayoutSettingsInput = z.infer<typeof layoutSettingsSchema>

// Sidebar Settings (imported from validations)
export type SidebarSettingsInput = SidebarSettings

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * 読み取り権限チェック（読み取りアクションは権限なしなら空結果を返す）
 */
async function checkReadPermission(): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  const role = getRoleFromSession(session)
  if (!role) return false
  if (!canAccessAdmin(role)) return false
  if (!hasPermission(role, 'settings', 'read')) {
    void logPermissionDenied(session.user.id, 'settings', 'read')
    return false
  }
  return true
}

/**
 * 書き込み権限チェック（カスタム戻り値型を持つアクション用）
 * withPermissionが使えない特殊なケース用
 */
async function checkWritePermission(): Promise<{ user: { id: string } } | { error: string }> {
  const session = await getSession()
  if (!session?.user) {
    return { error: 'ログインが必要です' }
  }
  const role = getRoleFromSession(session)
  if (!role) {
    return { error: '権限情報が取得できません' }
  }
  if (!canAccessAdmin(role)) {
    return { error: '管理者権限が必要です' }
  }
  if (!hasPermission(role, 'settings', 'update')) {
    void logPermissionDenied(session.user.id, 'settings', 'update')
    return { error: 'settingsのupdate権限がありません' }
  }
  return { user: { id: session.user.id } }
}

// =============================================================================
// Actions
// =============================================================================

/**
 * 設定を取得（公開ページ用・認証不要）
 * 機密情報（Stripeキー等）はマスク済みまたは除外
 */
export async function getPublicSettings(): Promise<SettingsData> {
  let settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
  })

  if (!settings) {
    settings = await prisma.settings.create({
      data: { id: 'singleton' },
    })
  }

  // Prisma JsonValueをZodバリデーション関数で安全に変換
  // 機密情報はnullとして返す（公開ページでは不要）
  return {
    ...settings,
    businessHours: parseBusinessHours(settings.businessHours),
    regularHolidays: parseStringArrayOrNull(settings.regularHolidays),
    specialHolidays: parseStringArrayOrNull(settings.specialHolidays),
    defaultBusinessHours: parseBusinessHours(settings.defaultBusinessHours),
    stripeSecretKeyMasked: null, // 機密情報は公開しない
    stripeWebhookSecretMasked: null,
    googleCalendarServiceAccountEmailMasked: null,
    // Two-Way Sync Settings
    googleCalendarTwoWaySyncEnabled: settings.googleCalendarTwoWaySyncEnabled,
    googleCalendarSyncMethod: settings.googleCalendarSyncMethod,
    googleCalendarPollingIntervalMin: settings.googleCalendarPollingIntervalMin,
    googleCalendarLastSyncedAt: settings.googleCalendarLastSyncedAt,
    googleCalendarWebhookActive: !!settings.googleCalendarWebhookChannelId,
    googleCalendarWebhookExpiration: settings.googleCalendarWebhookExpiration,
    // Layout Width Settings
    containerWidth: settings.containerWidth,
    containerWidthCustom: settings.containerWidthCustom,
    contentWidth: settings.contentWidth,
    contentWidthCustom: settings.contentWidthCustom,
    // Sidebar Settings
    sidebarEnabled: settings.sidebarEnabled,
    sidebarWidgets: settings.sidebarWidgets,
    sidebarRecentCount: settings.sidebarRecentCount,
    sidebarPopularCount: settings.sidebarPopularCount,
  }
}

/**
 * 設定を取得（管理画面用）
 */
export async function getSettings(): Promise<SettingsData | null> {
  const hasAccess = await checkReadPermission()
  if (!hasAccess) {
    return null
  }

  let settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
  })

  if (!settings) {
    settings = await prisma.settings.create({
      data: { id: 'singleton' },
    })
  }

  // Stripeキーをマスク表示用に変換
  const stripeSecretKeyMasked = settings.stripeSecretKey
    ? maskSecretKey(safeDecrypt(settings.stripeSecretKey) || '****')
    : null
  const stripeWebhookSecretMasked = settings.stripeWebhookSecret
    ? maskSecretKey(safeDecrypt(settings.stripeWebhookSecret) || '****')
    : null

  // Google Calendarサービスアカウントのメールをマスク表示用に抽出
  let googleCalendarServiceAccountEmailMasked: string | null = null
  if (settings.googleCalendarServiceAccountJson) {
    const decrypted = safeDecrypt(settings.googleCalendarServiceAccountJson)
    if (decrypted) {
      const email = extractServiceAccountEmail(decrypted)
      if (email) {
        // メールアドレスをマスク（例: ser****@project.iam.gserviceaccount.com）
        const [localPart, domain] = email.split('@')
        googleCalendarServiceAccountEmailMasked =
          localPart.slice(0, 3) + '****@' + domain
      }
    }
  }

  // Prisma JsonValueをZodバリデーション関数で安全に変換 + Stripeキーはマスク済みで返す
  return {
    ...settings,
    businessHours: parseBusinessHours(settings.businessHours),
    regularHolidays: parseStringArrayOrNull(settings.regularHolidays),
    specialHolidays: parseStringArrayOrNull(settings.specialHolidays),
    defaultBusinessHours: parseBusinessHours(settings.defaultBusinessHours),
    stripeSecretKeyMasked,
    stripeWebhookSecretMasked,
    googleCalendarServiceAccountEmailMasked,
    // Two-Way Sync Settings
    googleCalendarTwoWaySyncEnabled: settings.googleCalendarTwoWaySyncEnabled,
    googleCalendarSyncMethod: settings.googleCalendarSyncMethod,
    googleCalendarPollingIntervalMin: settings.googleCalendarPollingIntervalMin,
    googleCalendarLastSyncedAt: settings.googleCalendarLastSyncedAt,
    googleCalendarWebhookActive: !!settings.googleCalendarWebhookChannelId,
    googleCalendarWebhookExpiration: settings.googleCalendarWebhookExpiration,
    // Layout Width Settings
    containerWidth: settings.containerWidth,
    containerWidthCustom: settings.containerWidthCustom,
    contentWidth: settings.contentWidth,
    contentWidthCustom: settings.contentWidthCustom,
    // Sidebar Settings
    sidebarEnabled: settings.sidebarEnabled,
    sidebarWidgets: settings.sidebarWidgets,
    sidebarRecentCount: settings.sidebarRecentCount,
    sidebarPopularCount: settings.sidebarPopularCount,
  }
}

/**
 * 基本情報を更新
 */
export const updateBasicInfo = withPermission<[data: BasicInfoInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = basicInfoSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  revalidatePath('/admin/settings')
  revalidatePath('/')

  return createSuccess('基本情報を更新しました')
})

/**
 * 事業者情報を更新
 */
export const updateBusinessInfo = withPermission<[data: BusinessInfoInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = businessInfoSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const updateData = {
    ...parsed.data,
    establishedDate: parsed.data.establishedDate
      ? new Date(parsed.data.establishedDate)
      : null,
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  revalidatePath('/admin/settings')
  revalidatePath('/')

  return createSuccess('事業者情報を更新しました')
})

/**
 * 営業時間設定を更新
 */
export const updateBusinessHoursSettings = withPermission<[data: BusinessHoursSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = businessHoursSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // Prisma JSON null の適切な変換
  const updateData = {
    businessHours: parsed.data.businessHours,
    regularHolidays: parsed.data.regularHolidays ?? Prisma.JsonNull,
    specialHolidays: parsed.data.specialHolidays ?? Prisma.JsonNull,
    holidayNotice: parsed.data.holidayNotice,
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  revalidatePath('/admin/settings')
  revalidatePath('/')
  revalidatePath('/reservation')

  return createSuccess('営業時間設定を更新しました')
})

/**
 * 連絡先情報を更新
 */
export const updateContactInfo = withPermission<[data: ContactInfoInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = contactInfoSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const updateData = {
    ...parsed.data,
    email: parsed.data.email || null,
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  revalidatePath('/admin/settings')
  revalidatePath('/')

  return createSuccess('連絡先情報を更新しました')
})

/**
 * SEO設定を更新
 */
export const updateSeoSettings = withPermission<[data: SeoSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = seoSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  // Analytics設定キャッシュを即座に無効化
  revalidateTag('analytics-config', { expire: 0 })
  revalidatePath('/admin/settings')
  revalidatePath('/')

  return createSuccess('SEO設定を更新しました')
})

/**
 * メール設定を更新
 */
export const updateEmailSettings = withPermission<[data: EmailSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = emailSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const updateData = {
    ...parsed.data,
    senderEmail: parsed.data.senderEmail || null,
    replyToEmail: parsed.data.replyToEmail || null,
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  revalidatePath('/admin/settings')

  return createSuccess('メール設定を更新しました')
})

/**
 * 予約設定を更新
 */
export const updateReservationSettings = withPermission<[data: ReservationSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = reservationSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  revalidatePath('/admin/settings')

  return createSuccess('予約設定を更新しました')
})

/**
 * 通知設定を更新
 */
export const updateNotificationSettings = withPermission<[data: NotificationSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = notificationSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  revalidatePath('/admin/settings')

  return createSuccess('通知設定を更新しました')
})

/**
 * メンテナンス設定を更新
 */
export const updateMaintenanceSettings = withPermission<[data: MaintenanceSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = maintenanceSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  revalidatePath('/admin/settings')
  revalidatePath('/')

  return createSuccess('メンテナンス設定を更新しました')
})

// =============================================================================
// Stripe Actions
// =============================================================================

export { type StripeSettingsInput }

/**
 * Stripe設定を更新
 */
export const updateStripeSettings = withPermission<[data: StripeSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = stripeSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // シークレットキーを暗号化
  const updateData: Record<string, unknown> = {
    stripeEnabled: parsed.data.stripeEnabled,
    stripeTestMode: parsed.data.stripeTestMode,
    stripePublishableKey: parsed.data.stripePublishableKey || null,
    stripeCurrency: parsed.data.stripeCurrency,
  }

  // シークレットキーが入力された場合のみ更新（暗号化して保存）
  if (parsed.data.stripeSecretKey) {
    try {
      updateData.stripeSecretKey = encrypt(parsed.data.stripeSecretKey)
    } catch {
      return createFailure(
        'シークレットキーの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。'
      )
    }
  }

  // Webhookシークレットが入力された場合のみ更新（暗号化して保存）
  if (parsed.data.stripeWebhookSecret) {
    try {
      updateData.stripeWebhookSecret = encrypt(parsed.data.stripeWebhookSecret)
    } catch {
      return createFailure(
        'Webhookシークレットの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。'
      )
    }
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  revalidatePath('/admin/settings')

  return createSuccess('Stripe設定を更新しました')
})

/**
 * Stripe接続テスト
 */
export async function testStripeConnectionAction(
  secretKey: string
): Promise<{
  success: boolean
  error?: string
  accountId?: string
  mode?: 'test' | 'live'
}> {
  try {
    const check = await checkWritePermission()
    if ('error' in check) {
      return { success: false, error: check.error }
    }

    const result = await testStripeConnectionLib(secretKey)

    if (result.success) {
      // 接続成功時、ステータスを更新
      await prisma.settings.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          stripeLastTestedAt: new Date(),
          stripeConnectionStatus: 'connected',
          stripeAccountId: result.accountId,
        },
        update: {
          stripeLastTestedAt: new Date(),
          stripeConnectionStatus: 'connected',
          stripeAccountId: result.accountId,
        },
      })

      revalidatePath('/admin/settings')
    }

    return result
  } catch (error) {
    console.error('Failed to test Stripe connection:', error)
    return { success: false, error: '接続テストに失敗しました' }
  }
}

/**
 * Stripeキーをクリア
 */
export const clearStripeKeys = withPermission<[], void>(
  'settings',
  'update'
)(async (): Promise<ActionResult<void>> => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      stripeSecretKey: null,
      stripeWebhookSecret: null,
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeConnectionStatus: null,
      stripeLastTestedAt: null,
    },
  })

  revalidatePath('/admin/settings')

  return createSuccess('Stripeキーをクリアしました')
})

// =============================================================================
// Terms Agreement Actions
// =============================================================================

/**
 * 規約同意設定を取得（公開サイト用）
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
 * 規約同意設定を更新（管理画面用）
 */
export const updateTermsAgreementSettings = withPermission<[data: TermsAgreementSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = termsAgreementSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  revalidatePath('/admin/settings')
  revalidatePath('/reservation')

  return createSuccess('規約同意設定を更新しました')
})

/**
 * Cookie同意設定を更新
 */
export const updateCookieConsentSettings = withPermission<[data: CookieConsentSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = cookieConsentSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  revalidatePath('/admin/settings')
  revalidatePath('/')

  return createSuccess('Cookie同意設定を更新しました')
})

// =============================================================================
// Announcement Bar Carousel Settings
// =============================================================================

const announcementBarCarouselSettingsSchema = z.object({
  announcementBarAnimation: z.enum(['fade', 'slideX', 'slideY']),
  announcementBarDuration: z.number().int().min(1000).max(30000),
  announcementBarAutoPlay: z.boolean(),
  announcementBarPauseOnHover: z.boolean(),
  announcementBarShowArrows: z.boolean(),
  announcementBarShowIndicator: z.boolean(),
  announcementBarDesignStyle: z.enum(['solid', 'gradient', 'outlined', 'glass', 'minimal', 'striped']),
  // Common Color Settings
  announcementBarBgColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
  announcementBarTextColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
  // Striped Design Settings
  announcementBarStripeColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
  announcementBarStripeAnimation: z.boolean(),
  // Gradient Design Settings
  announcementBarGradientAnimation: z.boolean(),
  // Glass Design Settings
  announcementBarGlassAnimation: z.boolean(),
})

export type AnnouncementBarCarouselSettingsInput = z.infer<typeof announcementBarCarouselSettingsSchema>

/**
 * お知らせバーカルーセル設定を取得（フロントエンド用）
 */
export async function getAnnouncementBarCarouselSettings(): Promise<AnnouncementBarCarouselSettingsInput> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      announcementBarAnimation: true,
      announcementBarDuration: true,
      announcementBarAutoPlay: true,
      announcementBarPauseOnHover: true,
      announcementBarShowArrows: true,
      announcementBarShowIndicator: true,
      announcementBarDesignStyle: true,
      announcementBarBgColor: true,
      announcementBarTextColor: true,
      announcementBarStripeColor: true,
      announcementBarStripeAnimation: true,
      announcementBarGradientAnimation: true,
      announcementBarGlassAnimation: true,
    },
  })

  return {
    announcementBarAnimation: (settings?.announcementBarAnimation ?? 'fade') as 'fade' | 'slideX' | 'slideY',
    announcementBarDuration: settings?.announcementBarDuration ?? 5000,
    announcementBarAutoPlay: settings?.announcementBarAutoPlay ?? true,
    announcementBarPauseOnHover: settings?.announcementBarPauseOnHover ?? true,
    announcementBarShowArrows: settings?.announcementBarShowArrows ?? true,
    announcementBarShowIndicator: settings?.announcementBarShowIndicator ?? true,
    announcementBarDesignStyle: (settings?.announcementBarDesignStyle ?? 'solid') as 'solid' | 'gradient' | 'outlined' | 'glass' | 'minimal' | 'striped',
    announcementBarBgColor: settings?.announcementBarBgColor ?? null,
    announcementBarTextColor: settings?.announcementBarTextColor ?? null,
    announcementBarStripeColor: settings?.announcementBarStripeColor ?? null,
    announcementBarStripeAnimation: settings?.announcementBarStripeAnimation ?? false,
    announcementBarGradientAnimation: settings?.announcementBarGradientAnimation ?? false,
    announcementBarGlassAnimation: settings?.announcementBarGlassAnimation ?? false,
  }
}

/**
 * お知らせバーカルーセル設定を更新
 */
export const updateAnnouncementBarCarouselSettings = withPermission<[data: AnnouncementBarCarouselSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = announcementBarCarouselSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...parsed.data },
    update: parsed.data,
  })

  revalidatePath('/admin/settings')
  revalidatePath('/', 'layout')

  return createSuccess('お知らせバーカルーセル設定を更新しました')
})

// =============================================================================
// Google Calendar Actions
// =============================================================================

const googleCalendarSettingsSchema = z.object({
  googleCalendarEnabled: z.boolean(),
  googleCalendarId: z.string().max(200).nullable(),
  serviceAccountJson: z.string().nullable(), // 新規入力時のみ
  icalAttachmentEnabled: z.boolean(),
  addToCalendarLinksEnabled: z.boolean(),
})

export type GoogleCalendarSettingsInput = z.infer<typeof googleCalendarSettingsSchema>

/**
 * Google Calendar設定を更新
 */
export const updateGoogleCalendarSettings = withPermission<[data: GoogleCalendarSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = googleCalendarSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // カレンダーIDのバリデーション
  if (parsed.data.googleCalendarId && !isValidCalendarId(parsed.data.googleCalendarId)) {
    return createFailure('カレンダーIDの形式が無効です')
  }

  const updateData: Record<string, unknown> = {
    googleCalendarEnabled: parsed.data.googleCalendarEnabled,
    googleCalendarId: parsed.data.googleCalendarId || null,
    icalAttachmentEnabled: parsed.data.icalAttachmentEnabled,
    addToCalendarLinksEnabled: parsed.data.addToCalendarLinksEnabled,
  }

  // サービスアカウントJSONが入力された場合のみ更新（暗号化して保存）
  if (parsed.data.serviceAccountJson) {
    try {
      // JSONとして有効か確認
      JSON.parse(parsed.data.serviceAccountJson)
      updateData.googleCalendarServiceAccountJson = encryptServiceAccountJson(
        parsed.data.serviceAccountJson
      )
    } catch {
      return createFailure('サービスアカウントJSONの形式が無効です')
    }
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  })

  revalidatePath('/admin/settings')

  return createSuccess('Google Calendar設定を更新しました')
})

/**
 * サービスアカウント接続テスト
 */
export async function testGoogleCalendarConnectionAction(params: {
  serviceAccountJson: string
  calendarId: string
}): Promise<{
  success: boolean
  error?: string
  calendarName?: string
  accountEmail?: string
}> {
  try {
    const check = await checkWritePermission()
    if ('error' in check) {
      return { success: false, error: check.error }
    }

    if (!isValidCalendarId(params.calendarId)) {
      return { success: false, error: 'カレンダーIDの形式が無効です' }
    }

    const result = await testServiceAccountConnection({
      serviceAccountJson: params.serviceAccountJson,
      calendarId: params.calendarId,
    })

    if (result.success) {
      // 接続成功時、ステータスを更新
      await prisma.settings.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          googleCalendarLastTestedAt: new Date(),
          googleCalendarConnectionStatus: 'connected',
        },
        update: {
          googleCalendarLastTestedAt: new Date(),
          googleCalendarConnectionStatus: 'connected',
        },
      })

      revalidatePath('/admin/settings')
    } else {
      // 接続失敗時もステータスを更新
      await prisma.settings.update({
        where: { id: 'singleton' },
        data: {
          googleCalendarConnectionStatus: 'error',
        },
      })
    }

    return result
  } catch (error) {
    console.error('Failed to test Google Calendar connection:', error)
    return { success: false, error: '接続テストに失敗しました' }
  }
}

/**
 * OAuth接続テスト（管理者の個人カレンダー）
 */
export async function testGoogleCalendarOAuthAction(): Promise<{
  success: boolean
  error?: string
  calendarName?: string
}> {
  try {
    const check = await checkWritePermission()
    if ('error' in check) {
      return { success: false, error: check.error }
    }

    const result = await testOAuthConnection(check.user.id)

    if (result.success) {
      // 接続成功時、OAuth有効フラグを更新
      await prisma.settings.upsert({
        where: { id: 'singleton' },
        create: {
          id: 'singleton',
          googleCalendarOAuthEnabled: true,
        },
        update: {
          googleCalendarOAuthEnabled: true,
        },
      })

      revalidatePath('/admin/settings')
    }

    return result
  } catch (error) {
    console.error('Failed to test OAuth connection:', error)
    return { success: false, error: 'OAuth接続テストに失敗しました' }
  }
}

/**
 * Google Calendarサービスアカウント認証情報をクリア
 */
export const clearGoogleCalendarServiceAccount = withPermission<[], void>(
  'settings',
  'update'
)(async (): Promise<ActionResult<void>> => {
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      googleCalendarServiceAccountJson: null,
      googleCalendarConnectionStatus: null,
      googleCalendarLastTestedAt: null,
    },
  })

  revalidatePath('/admin/settings')

  return createSuccess('サービスアカウント認証情報をクリアしました')
})

/**
 * Google Calendar OAuth連携を解除
 */
export const disconnectGoogleCalendarOAuth = withPermission<[], void>(
  'settings',
  'update'
)(async (user): Promise<ActionResult<void>> => {
  // Accountテーブルからトークンを削除
  await prisma.account.deleteMany({
    where: {
      userId: user.id,
      providerId: 'google',
    },
  })

  // OAuth有効フラグをオフ
  await prisma.settings.update({
    where: { id: 'singleton' },
    data: {
      googleCalendarOAuthEnabled: false,
    },
  })

  revalidatePath('/admin/settings')

  return createSuccess('Google Calendar OAuth連携を解除しました')
})

/**
 * Google Calendar設定を取得（公開用）
 */
export { getGoogleCalendarSettings }

// =============================================================================
// Two-Way Sync Actions (Phase 4)
// =============================================================================

const twoWaySyncSettingsSchema = z.object({
  enabled: z.boolean(),
  syncMethod: z.enum(['polling', 'webhook', 'both']),
  pollingIntervalMin: z.number().int().min(1).max(60),
})

export type TwoWaySyncSettingsInput = z.infer<typeof twoWaySyncSettingsSchema>

/**
 * 双方向同期設定を更新
 */
export const updateTwoWaySyncSettings = withPermission<[data: TwoWaySyncSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = twoWaySyncSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      googleCalendarTwoWaySyncEnabled: parsed.data.enabled,
      googleCalendarSyncMethod: parsed.data.syncMethod,
      googleCalendarPollingIntervalMin: parsed.data.pollingIntervalMin,
    },
    update: {
      googleCalendarTwoWaySyncEnabled: parsed.data.enabled,
      googleCalendarSyncMethod: parsed.data.syncMethod,
      googleCalendarPollingIntervalMin: parsed.data.pollingIntervalMin,
    },
  })

  revalidatePath('/admin/settings')

  return createSuccess('双方向同期設定を更新しました')
})

/**
 * Webhookを設定
 */
export async function setupCalendarWebhook(): Promise<{
  success: boolean
  error?: string
  expiration?: Date
}> {
  try {
    const check = await checkWritePermission()
    if ('error' in check) {
      return { success: false, error: check.error }
    }

    // ベースURLを取得（環境変数から）
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    if (!baseUrl) {
      return { success: false, error: 'APP_URLが設定されていません' }
    }

    const webhookUrl = `${baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`}/api/webhooks/google-calendar`

    const result = await setupWebhookWatch(webhookUrl)

    if (result.success && result.channelId && result.resourceId) {
      await prisma.settings.update({
        where: { id: 'singleton' },
        data: {
          googleCalendarWebhookChannelId: result.channelId,
          googleCalendarWebhookResourceId: result.resourceId,
          googleCalendarWebhookExpiration: result.expiration,
        },
      })

      revalidatePath('/admin/settings')

      return { success: true, expiration: result.expiration }
    }

    return { success: false, error: result.error }
  } catch (error) {
    console.error('Failed to setup webhook:', error)
    return { success: false, error: 'Webhook設定に失敗しました' }
  }
}

/**
 * Webhookを停止
 */
export async function stopCalendarWebhook(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const check = await checkWritePermission()
    if ('error' in check) {
      return { success: false, error: check.error }
    }

    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: {
        googleCalendarWebhookChannelId: true,
        googleCalendarWebhookResourceId: true,
      },
    })

    if (!settings?.googleCalendarWebhookChannelId || !settings?.googleCalendarWebhookResourceId) {
      return { success: false, error: 'Webhookが設定されていません' }
    }

    const result = await stopWebhookWatch(
      settings.googleCalendarWebhookChannelId,
      settings.googleCalendarWebhookResourceId
    )

    if (result.success) {
      await prisma.settings.update({
        where: { id: 'singleton' },
        data: {
          googleCalendarWebhookChannelId: null,
          googleCalendarWebhookResourceId: null,
          googleCalendarWebhookExpiration: null,
        },
      })

      revalidatePath('/admin/settings')
    }

    return result
  } catch (error) {
    console.error('Failed to stop webhook:', error)
    return { success: false, error: 'Webhook停止に失敗しました' }
  }
}

/**
 * 手動で同期を実行
 */
export async function triggerManualSync(): Promise<{
  success: boolean
  processed?: number
  deleted?: number
  updated?: number
  errors?: string[]
}> {
  try {
    const check = await checkWritePermission()
    if ('error' in check) {
      return { success: false, errors: [check.error] }
    }

    const result = await syncFromCalendar()

    revalidatePath('/admin/settings')
    revalidatePath('/admin/reservations')

    return {
      success: result.success,
      processed: result.processed,
      deleted: result.deleted,
      updated: result.updated,
      errors: result.errors.length > 0 ? result.errors : undefined,
    }
  } catch (error) {
    console.error('Manual sync failed:', error)
    return { success: false, errors: ['同期に失敗しました'] }
  }
}

// =============================================================================
// Layout Settings Actions
// =============================================================================

/**
 * レイアウト設定を更新
 */
export const updateLayoutSettings = withPermission<[data: LayoutSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = layoutSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // CUSTOMを選択している場合はカスタム値が必須
  if (parsed.data.containerWidth === 'CUSTOM' && !parsed.data.containerWidthCustom) {
    return createFailure('Container幅のカスタム値を入力してください')
  }
  if (parsed.data.contentWidth === 'CUSTOM' && !parsed.data.contentWidthCustom) {
    return createFailure('コンテンツ幅のカスタム値を入力してください')
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      containerWidth: parsed.data.containerWidth,
      containerWidthCustom: parsed.data.containerWidth === 'CUSTOM' ? parsed.data.containerWidthCustom : null,
      contentWidth: parsed.data.contentWidth,
      contentWidthCustom: parsed.data.contentWidth === 'CUSTOM' ? parsed.data.contentWidthCustom : null,
    },
    update: {
      containerWidth: parsed.data.containerWidth,
      containerWidthCustom: parsed.data.containerWidth === 'CUSTOM' ? parsed.data.containerWidthCustom : null,
      contentWidth: parsed.data.contentWidth,
      contentWidthCustom: parsed.data.contentWidth === 'CUSTOM' ? parsed.data.contentWidthCustom : null,
    },
  })

  revalidatePath('/admin/settings')
  revalidatePath('/', 'layout')
  revalidateTag('settings', { expire: 0 })
  revalidateTag('layout-settings', { expire: 0 })

  return createSuccess('レイアウト設定を更新しました')
})

// =============================================================================
// Sidebar Settings Actions
// =============================================================================

/**
 * サイドバー設定を更新
 */
export const updateSidebarSettings = withPermission<[data: SidebarSettingsInput], void>(
  'settings',
  'update'
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = sidebarSettingsSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      sidebarEnabled: parsed.data.sidebarEnabled,
      sidebarWidgets: parsed.data.sidebarWidgets,
      sidebarRecentCount: parsed.data.sidebarRecentCount,
      sidebarPopularCount: parsed.data.sidebarPopularCount,
    },
    update: {
      sidebarEnabled: parsed.data.sidebarEnabled,
      sidebarWidgets: parsed.data.sidebarWidgets,
      sidebarRecentCount: parsed.data.sidebarRecentCount,
      sidebarPopularCount: parsed.data.sidebarPopularCount,
    },
  })

  revalidatePath('/admin/settings')
  revalidatePath('/blog', 'layout')
  revalidateTag('sidebar-settings', { expire: 0 })
  revalidateTag('sidebar-data', { expire: 0 })

  return createSuccess('サイドバー設定を更新しました')
})
