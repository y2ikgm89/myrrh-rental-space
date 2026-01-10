'use server'

import { prisma, Prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { encrypt, safeDecrypt } from '@/lib/crypto'
import {
  maskSecretKey,
  testStripeConnection as testStripeConnectionLib,
} from '@/lib/stripe'
import { stripeSettingsSchema, type StripeSettingsInput } from '@/lib/validations/stripe'

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
  defaultBusinessHours: unknown | null
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

export type BasicInfoInput = z.infer<typeof basicInfoSchema>
export type BusinessInfoInput = z.infer<typeof businessInfoSchema>
export type ContactInfoInput = z.infer<typeof contactInfoSchema>
export type BusinessHoursSettingsInput = z.infer<typeof businessHoursSettingsSchema>
export type SeoSettingsInput = z.infer<typeof seoSettingsSchema>
export type EmailSettingsInput = z.infer<typeof emailSettingsSchema>
export type ReservationSettingsInput = z.infer<typeof reservationSettingsSchema>
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>
export type MaintenanceSettingsInput = z.infer<typeof maintenanceSettingsSchema>

// =============================================================================
// Actions
// =============================================================================

/**
 * 設定を取得
 */
export async function getSettings(): Promise<SettingsData> {
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

  // Prisma JsonValueを適切な型にキャスト + Stripeキーはマスク済みで返す
  return {
    ...settings,
    businessHours: settings.businessHours as BusinessHours | null,
    regularHolidays: settings.regularHolidays as string[] | null,
    specialHolidays: settings.specialHolidays as string[] | null,
    stripeSecretKeyMasked,
    stripeWebhookSecretMasked,
  }
}

/**
 * 基本情報を更新
 */
export async function updateBasicInfo(
  data: BasicInfoInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = basicInfoSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message }
    }

    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...parsed.data },
      update: parsed.data,
    })

    revalidatePath('/admin/settings')
    revalidatePath('/')

    return { success: true }
  } catch (error) {
    console.error('Failed to update basic info:', error)
    return { success: false, error: '基本情報の更新に失敗しました' }
  }
}

/**
 * 事業者情報を更新
 */
export async function updateBusinessInfo(
  data: BusinessInfoInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = businessInfoSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message }
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

    return { success: true }
  } catch (error) {
    console.error('Failed to update business info:', error)
    return { success: false, error: '事業者情報の更新に失敗しました' }
  }
}

/**
 * 営業時間設定を更新
 */
export async function updateBusinessHoursSettings(
  data: BusinessHoursSettingsInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = businessHoursSettingsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message }
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

    return { success: true }
  } catch (error) {
    console.error('Failed to update business hours settings:', error)
    return { success: false, error: '営業時間設定の更新に失敗しました' }
  }
}

/**
 * 連絡先情報を更新
 */
export async function updateContactInfo(
  data: ContactInfoInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = contactInfoSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message }
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

    return { success: true }
  } catch (error) {
    console.error('Failed to update contact info:', error)
    return { success: false, error: '連絡先情報の更新に失敗しました' }
  }
}

/**
 * SEO設定を更新
 */
export async function updateSeoSettings(
  data: SeoSettingsInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = seoSettingsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message }
    }

    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...parsed.data },
      update: parsed.data,
    })

    revalidatePath('/admin/settings')
    revalidatePath('/')

    return { success: true }
  } catch (error) {
    console.error('Failed to update SEO settings:', error)
    return { success: false, error: 'SEO設定の更新に失敗しました' }
  }
}

/**
 * メール設定を更新
 */
export async function updateEmailSettings(
  data: EmailSettingsInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = emailSettingsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message }
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

    return { success: true }
  } catch (error) {
    console.error('Failed to update email settings:', error)
    return { success: false, error: 'メール設定の更新に失敗しました' }
  }
}

/**
 * 予約設定を更新
 */
export async function updateReservationSettings(
  data: ReservationSettingsInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = reservationSettingsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message }
    }

    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...parsed.data },
      update: parsed.data,
    })

    revalidatePath('/admin/settings')

    return { success: true }
  } catch (error) {
    console.error('Failed to update reservation settings:', error)
    return { success: false, error: '予約設定の更新に失敗しました' }
  }
}

/**
 * 通知設定を更新
 */
export async function updateNotificationSettings(
  data: NotificationSettingsInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = notificationSettingsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message }
    }

    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...parsed.data },
      update: parsed.data,
    })

    revalidatePath('/admin/settings')

    return { success: true }
  } catch (error) {
    console.error('Failed to update notification settings:', error)
    return { success: false, error: '通知設定の更新に失敗しました' }
  }
}

/**
 * メンテナンス設定を更新
 */
export async function updateMaintenanceSettings(
  data: MaintenanceSettingsInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = maintenanceSettingsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message }
    }

    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...parsed.data },
      update: parsed.data,
    })

    revalidatePath('/admin/settings')
    revalidatePath('/')

    return { success: true }
  } catch (error) {
    console.error('Failed to update maintenance settings:', error)
    return { success: false, error: 'メンテナンス設定の更新に失敗しました' }
  }
}

// =============================================================================
// Stripe Actions
// =============================================================================

export { type StripeSettingsInput }

/**
 * Stripe設定を更新
 */
export async function updateStripeSettings(
  data: StripeSettingsInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = stripeSettingsSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message }
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
        return {
          success: false,
          error: 'シークレットキーの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。',
        }
      }
    }

    // Webhookシークレットが入力された場合のみ更新（暗号化して保存）
    if (parsed.data.stripeWebhookSecret) {
      try {
        updateData.stripeWebhookSecret = encrypt(parsed.data.stripeWebhookSecret)
      } catch {
        return {
          success: false,
          error: 'Webhookシークレットの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。',
        }
      }
    }

    await prisma.settings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...updateData },
      update: updateData,
    })

    revalidatePath('/admin/settings')

    return { success: true }
  } catch (error) {
    console.error('Failed to update Stripe settings:', error)
    return { success: false, error: 'Stripe設定の更新に失敗しました' }
  }
}

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
export async function clearStripeKeys(): Promise<{ success: boolean; error?: string }> {
  try {
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

    return { success: true }
  } catch (error) {
    console.error('Failed to clear Stripe keys:', error)
    return { success: false, error: 'Stripeキーのクリアに失敗しました' }
  }
}
