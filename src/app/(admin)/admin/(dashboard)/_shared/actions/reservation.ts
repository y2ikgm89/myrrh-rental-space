'use server'

/**
 * 予約管理 Server Actions（管理側）
 *
 * 管理画面での予約操作を提供するServer Actions。
 * 一覧取得、ステータス更新、削除、管理者による予約作成などを行います。
 *
 * ## 主な機能
 * - 予約一覧取得（フィルタ・ページネーション対応）
 * - 予約詳細取得
 * - ステータス更新（確定・キャンセル）
 * - 予約メモ更新
 * - 予約削除
 * - カレンダー表示用データ取得
 * - 管理者による予約作成（電話予約等）
 *
 * ## 権限チェック
 * - すべての操作でロールベースの権限チェックを実施
 * - 権限不足時は監査ログに記録
 *
 * @module admin/actions/reservation
 */

import { prisma } from '@/shared/lib/prisma'
import { logError, ErrorCategory, ErrorSeverity, ReservationOverlapError, isReservationOverlapError } from '@/shared/lib/errors'
import { fireAndForget } from '@/shared/lib/async-utils'
import { updateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { ReservationStatus } from '@/shared/generated/prisma/enums'
import { z } from 'zod'
import {
  sendReservationConfirmationEmail,
  sendReservationCancelledEmail,
  sendReservationAdminNotification,
} from '@/shared/lib/email-service'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'
import type { ReservationWhereInput } from '@/shared/types/prisma'
import { toPlainObject, toPlainArray } from '@/shared/lib/serialize'
import { syncReservationToCalendar, updateCalendarSync, deleteCalendarSync, type ReservationSyncData } from '@/shared/lib/calendar-sync'
import { checkReadPermissionFor } from '@/admin/lib/permissions'
import { checkReservationOverlap } from '@/shared/lib/reservation'
import {
  adminReservationSchema,
  type AdminReservationInput,
  updateReservationSchema,
  type UpdateReservationInput,
} from '@/admin/lib/validations/admin-reservation'
import { extractFieldErrors } from '@/shared/lib/action-helpers'
import { calculateReservationPrice, parseDurationDiscountRules } from '@/shared/lib/pricing'
import { getValidDiscountCombinationMode } from '@/shared/lib/validations/enums'
import { incrementCouponUsage, validateCouponCode, decrementCouponUsage } from '@/shared/actions/coupon'

// =============================================================================
// Types
// =============================================================================

export type ReservationWithRelations = {
  id: string
  spaceId: string
  customerId: string
  startTime: Date
  endTime: Date
  status: ReservationStatus
  totalPrice: number | null
  basePrice: number | null
  couponId: string | null
  couponDiscountAmount: number | null
  durationDiscountAmount: number | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
  space: {
    id: string
    name: string
  }
  customer: {
    id: string
    firstName: string
    lastName: string
    email: string
    phoneNumber: string | null
  }
  coupon?: {
    id: string
    code: string
    name: string
  } | null
}

export type GetReservationsResult = {
  reservations: ReservationWithRelations[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type ReservationFilters = {
  status?: ReservationStatus | 'ALL'
  search?: string
  startDate?: string
  endDate?: string
  spaceId?: string
}

export type ReservationPagination = {
  page?: number
  limit?: number
  sortBy?: 'startTime' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

// =============================================================================
// Schemas
// =============================================================================

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']),
})

const updateNotesSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(1000).nullable(),
})

// =============================================================================
// Helper Functions
// =============================================================================

const checkReadPermission = checkReadPermissionFor('reservation')

// =============================================================================
// Actions
// =============================================================================

/**
 * 予約一覧を取得
 */
export async function getReservations(
  filters: ReservationFilters = {},
  pagination: ReservationPagination = {}
): Promise<GetReservationsResult> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return { reservations: [], total: 0, page: 1, limit: 10, totalPages: 0 }
  }

  const {
    status,
    search,
    startDate,
    endDate,
    spaceId,
  } = filters

  const {
    page = 1,
    limit = 10,
    sortBy = 'startTime',
    sortOrder = 'desc',
  } = pagination

  // Where条件を構築
  const where: ReservationWhereInput = {}

  if (status && status !== 'ALL') {
    where.status = status
  }

  if (spaceId) {
    where.spaceId = spaceId
  }

  if (startDate || endDate) {
    where.startTime = {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    }
  }

  if (search) {
    where.OR = [
      {
        customer: {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      },
      {
        space: {
          name: { contains: search, mode: 'insensitive' },
        },
      },
    ]
  }

  // 総件数と予約一覧を並列取得（N+1解消）
  const [total, reservations] = await prisma.$transaction([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({
      where,
      include: {
        space: {
          select: {
            id: true,
            name: true,
          },
        },
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  const formattedReservations: ReservationWithRelations[] = toPlainArray(reservations)

  return toPlainObject({
    reservations: formattedReservations,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}

/**
 * 予約詳細を取得
 */
export async function getReservationById(
  id: string
): Promise<ReservationWithRelations | null> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return null
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      space: {
        select: {
          id: true,
          name: true,
        },
      },
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
        },
      },
      coupon: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  })

  if (!reservation) {
    return null
  }

  return toPlainObject(reservation)
}

/**
 * 予約ステータスを更新
 */
export const updateReservationStatus = withPermission<[string, ReservationStatus]>(
  'reservation',
  'update'
)(async (_user, id, status) => {
  const parsed = updateStatusSchema.safeParse({ id, status })
  if (!parsed.success) {
    return createFailure('入力が不正です')
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      space: { select: { name: true, address: true } },
      customer: { select: { firstName: true, lastName: true, email: true } },
    },
  })

  if (!reservation) {
    return createFailure('予約が見つかりません')
  }

  const previousStatus = reservation.status

  await prisma.reservation.update({
    where: { id },
    data: { status },
  })

  // ステータス変更時にメール送信
  const emailData = {
    reservationId: id,
    customerEmail: reservation.customer.email,
    customerName: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
    spaceName: reservation.space.name,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    totalPrice: reservation.totalPrice,
    notes: reservation.notes || undefined,
  }

  // カレンダー同期用データ
  const calendarData: ReservationSyncData = {
    reservationId: id,
    spaceName: reservation.space.name,
    customerName: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
    customerEmail: reservation.customer.email,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    location: reservation.space.address ?? undefined,
    notes: reservation.notes ?? undefined,
    totalPrice: reservation.totalPrice,
  }

  // 確定時: 確認メール送信 + カレンダー同期
  if (status === 'CONFIRMED' && previousStatus !== 'CONFIRMED') {
    // カレンダーイベント更新 or 新規作成（バックグラウンド）
    if (reservation.googleCalendarEventId) {
      // 既存イベントを更新
      fireAndForget(
        updateCalendarSync(calendarData, reservation.googleCalendarEventId),
        {
          operation: 'updateCalendarSync',
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: { reservationId: id },
        }
      )
    } else {
      // イベントがない場合は新規作成（初回同期失敗時のフォールバック）
      fireAndForget(
        syncReservationToCalendar(calendarData),
        {
          operation: 'syncReservationToCalendar',
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: { reservationId: id },
        }
      )
    }
    // メール送信（バックグラウンド）
    fireAndForget(
      Promise.all([
        sendReservationConfirmationEmail(emailData),
        sendReservationAdminNotification(emailData, previousStatus === 'PENDING' ? 'new' : 'update'),
      ]),
      {
        operation: 'sendConfirmationEmails',
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { reservationId: id },
      }
    )
  }

  // キャンセル時: キャンセルメール送信 + カレンダー削除
  if (status === 'CANCELLED' && previousStatus !== 'CANCELLED') {
    // カレンダーイベント削除（バックグラウンド）
    if (reservation.googleCalendarEventId) {
      fireAndForget(
        deleteCalendarSync(id, reservation.googleCalendarEventId),
        {
          operation: 'deleteCalendarSync',
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: { reservationId: id },
        }
      )
    }
    // メール送信（バックグラウンド）
    fireAndForget(
      Promise.all([
        sendReservationCancelledEmail(emailData),
        sendReservationAdminNotification(emailData, 'cancel'),
      ]),
      {
        operation: 'sendCancellationEmails',
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { reservationId: id },
      }
    )
  }

  updateTag(CACHE_TAGS.RESERVATIONS)
  updateTag(getCacheTag.reservations.detail(id))

  return createSuccess('ステータスを更新しました')
})

/**
 * 予約メモを更新
 */
export const updateReservationNotes = withPermission<[string, string | null]>(
  'reservation',
  'update'
)(async (_user, id, notes) => {
  const parsed = updateNotesSchema.safeParse({ id, notes })
  if (!parsed.success) {
    return createFailure('入力が不正です')
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!reservation) {
    return createFailure('予約が見つかりません')
  }

  await prisma.reservation.update({
    where: { id },
    data: { notes },
  })

  updateTag(CACHE_TAGS.RESERVATIONS)
  updateTag(getCacheTag.reservations.detail(id))

  return createSuccess('メモを更新しました')
})

/**
 * 予約を削除
 */
export const deleteReservation = withPermission<[string]>(
  'reservation',
  'delete'
)(async (_user, id) => {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    select: { id: true, googleCalendarEventId: true },
  })

  if (!reservation) {
    return createFailure('予約が見つかりません')
  }

  // カレンダーからイベントを削除（バックグラウンド、DB削除前に開始）
  if (reservation.googleCalendarEventId) {
    fireAndForget(
      deleteCalendarSync(id, reservation.googleCalendarEventId),
      {
        operation: 'deleteCalendarSync',
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { reservationId: id, trigger: 'deleteReservation' },
      }
    )
  }

  await prisma.reservation.delete({
    where: { id },
  })

  updateTag(CACHE_TAGS.RESERVATIONS)

  return createSuccess('予約を削除しました')
})

/**
 * カレンダー表示用予約データ取得
 */
export async function getReservationsForCalendar(
  startDate: Date,
  endDate: Date,
  spaceId?: string,
  status?: ReservationStatus | 'ALL'
): Promise<{
  id: string
  title: string
  spaceId: string
  spaceName: string
  startTime: Date
  endTime: Date
  status: ReservationStatus
  totalPrice: number | null
  notes: string | null
  customerName: string
  customerEmail: string
  customerPhone: string | null
}[]> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return []
  }

  // 期間と重複する予約を取得
  // 重複条件: reservation.startTime < endDate AND reservation.endTime > startDate
  const where: ReservationWhereInput = {
    AND: [
      { startTime: { lt: endDate } },
      { endTime: { gt: startDate } },
    ],
  }

  if (spaceId) {
    where.spaceId = spaceId
  }

  if (status && status !== 'ALL') {
    where.status = status
  }

  const reservations = await prisma.reservation.findMany({
    where,
    include: {
      space: { select: { id: true, name: true } },
      customer: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })

  return reservations.map((r) => ({
    id: r.id,
    title: `${r.customer.lastName} ${r.customer.firstName}`,
    spaceId: r.space.id,
    spaceName: r.space.name,
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    totalPrice: r.totalPrice,
    notes: r.notes,
    customerName: `${r.customer.lastName} ${r.customer.firstName}`,
    customerEmail: r.customer.email,
    customerPhone: r.customer.phoneNumber,
  }))
}

/**
 * カレンダー用スペース一覧取得
 */
export async function getSpacesForCalendar(): Promise<
  { id: string; name: string }[]
> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return []
  }

  const spaces = await prisma.space.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return spaces
}

/**
 * 統計情報を取得（ダッシュボード用）
 */
export async function getReservationStats(): Promise<{
  total: number
  pending: number
  confirmed: number
  cancelled: number
  todayCount: number
  thisWeekCount: number
}> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return { total: 0, pending: 0, confirmed: 0, cancelled: 0, todayCount: 0, thisWeekCount: 0 }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())

  const [total, pending, confirmed, cancelled, todayCount, thisWeekCount] =
    await Promise.all([
      prisma.reservation.count(),
      prisma.reservation.count({ where: { status: 'PENDING' } }),
      prisma.reservation.count({ where: { status: 'CONFIRMED' } }),
      prisma.reservation.count({ where: { status: 'CANCELLED' } }),
      prisma.reservation.count({
        where: {
          startTime: {
            gte: today,
            lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.reservation.count({
        where: {
          startTime: {
            gte: weekStart,
          },
        },
      }),
    ])

  return {
    total,
    pending,
    confirmed,
    cancelled,
    todayCount,
    thisWeekCount,
  }
}

// =============================================================================
// Admin Reservation Creation
// =============================================================================

/**
 * 管理者用予約作成
 *
 * 電話予約など、管理者が手動で予約を入力する場合に使用。
 * 公開サイトとの違い:
 * - Turnstile不要
 * - 規約同意不要
 * - ステータス選択可能
 * - 料金手動調整可能
 * - 顧客は既存選択 or 新規作成
 */
export const createAdminReservation = withPermission<[AdminReservationInput]>(
  'reservation',
  'create'
)(async (_user, input): Promise<ActionResult<{ id: string }>> => {
  // バリデーション
  const validation = adminReservationSchema.safeParse(input)
  if (!validation.success) {
    return createFailure('入力内容に誤りがあります', extractFieldErrors(validation.error))
  }

  const {
    spaceId,
    date,
    startTime,
    endTime,
    customerId,
    customerData,
    totalPrice,
    couponCode,
    manualDiscountAmount,
    manualDiscountReason,
    status,
    notes,
    sendEmail,
  } = validation.data

  // 日時を Date オブジェクトに変換
  const startDateTime = new Date(`${date}T${startTime}:00`)
  const endDateTime = new Date(`${date}T${endTime}:00`)

  // スペース確認・重複チェック・割引設定を並列取得
  const [space, overlapCheck, settings] = await Promise.all([
    prisma.space.findUnique({
      where: { id: spaceId, isActive: true },
      select: { id: true, name: true, address: true, hourlyPrice: true },
    }),
    checkReservationOverlap({
      spaceId,
      startTime: startDateTime,
      endTime: endDateTime,
    }),
    prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: {
        durationDiscountEnabled: true,
        durationDiscountRules: true,
        discountCombinationMode: true,
      },
    }),
  ])

  if (!space) {
    return createFailure('指定されたスペースが見つかりません')
  }

  if (overlapCheck.hasOverlap) {
    return createFailure('選択された時間帯は既に予約されています。別の時間帯をお選びください。')
  }

  // 時間計算
  const hours = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60)
  const hourlyPrice = space.hourlyPrice
  const basePrice = Math.floor(hourlyPrice * hours)

  // クーポン検証
  let validatedCoupon: {
    id: string
    code: string
    name: string
    type: 'PERCENTAGE' | 'FIXED_AMOUNT'
    discountValue: number
    maxDiscountAmount: number | null
    canCombineWithDurationDiscount: boolean
  } | null = null

  if (couponCode && couponCode.trim()) {
    const couponResult = await validateCouponCode(couponCode, basePrice)
    if (!couponResult.success) {
      return createFailure(couponResult.error)
    }
    validatedCoupon = couponResult.data?.coupon ?? null
  }

  // 料金計算
  const priceCalculation = calculateReservationPrice({
    hourlyPrice,
    hours,
    durationRules: parseDurationDiscountRules(settings?.durationDiscountRules),
    durationDiscountEnabled: settings?.durationDiscountEnabled ?? false,
    coupon: validatedCoupon,
    combinationMode: getValidDiscountCombinationMode(settings?.discountCombinationMode),
    showWarning: false,
  })

  // 最終料金（手動設定があればそれを優先、なければ自動計算）
  const calculatedPrice = totalPrice ?? priceCalculation.totalPrice

  // 割引情報
  const couponId = priceCalculation.appliedCoupon?.id ?? null
  const couponDiscountAmount = priceCalculation.couponDiscount > 0 ? priceCalculation.couponDiscount : null
  const durationDiscountAmount = priceCalculation.durationDiscount > 0 ? priceCalculation.durationDiscount : null

  // トランザクションで顧客と予約を作成
  // 型定義: 予約 + 顧客情報（includeで取得）
  type ReservationWithCustomer = Awaited<ReturnType<typeof prisma.reservation.create>> & {
    customer: {
      firstName: string
      lastName: string
      email: string
    }
  }
  let result: ReservationWithCustomer
  try {
    result = await prisma.$transaction(async (tx) => {
      // 重複チェック（トランザクション内で再検証 - Race Condition防止）
      const overlapCheckTx = await checkReservationOverlap(
        { spaceId, startTime: startDateTime, endTime: endDateTime },
        tx
      )
      if (overlapCheckTx.hasOverlap) {
        throw new ReservationOverlapError()
      }

      let resolvedCustomerId = customerId

    // 新規顧客の場合は作成
    if (!resolvedCustomerId && customerData) {
      // メールで既存顧客を検索
      let customer = await tx.customer.findUnique({
        where: { email: customerData.email },
      })

      if (!customer) {
        // 新規顧客作成
        customer = await tx.customer.create({
          data: {
            lastName: customerData.lastName,
            firstName: customerData.firstName,
            email: customerData.email,
            phoneNumber: customerData.phoneNumber || null,
          },
        })
      } else {
        // 既存顧客の情報を更新
        customer = await tx.customer.update({
          where: { email: customerData.email },
          data: {
            lastName: customerData.lastName,
            firstName: customerData.firstName,
            phoneNumber: customerData.phoneNumber || customer.phoneNumber,
          },
        })
      }
      resolvedCustomerId = customer.id
    }

    if (!resolvedCustomerId) {
      throw new Error('顧客IDが解決できませんでした')
    }

    // 予約を作成（割引情報を含む）
    const reservation = await tx.reservation.create({
      data: {
        spaceId,
        customerId: resolvedCustomerId,
        startTime: startDateTime,
        endTime: endDateTime,
        totalPrice: calculatedPrice,
        basePrice: basePrice,
        couponId: couponId,
        couponDiscountAmount: couponDiscountAmount,
        durationDiscountAmount: durationDiscountAmount,
        notes: manualDiscountAmount && manualDiscountReason
          ? `${notes || ''}\n【手動割引】¥${manualDiscountAmount.toLocaleString()} - ${manualDiscountReason}`.trim()
          : notes || null,
        status,
      },
      include: {
        customer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    })

    // クーポン使用回数をインクリメント
    if (couponId) {
      await incrementCouponUsage(couponId)
    }

    // 顧客の予約統計を更新
    const customer = await tx.customer.findUnique({
      where: { id: resolvedCustomerId },
      select: { id: true, firstReservationAt: true },
    })

    await tx.customer.update({
      where: { id: resolvedCustomerId },
      data: {
        totalReservations: { increment: 1 },
        lastReservationAt: new Date(),
        firstReservationAt: customer?.firstReservationAt ?? new Date(),
      },
    })

      return reservation
    })
  } catch (error) {
    // 重複エラー（Race Condition検出時）
    if (isReservationOverlapError(error)) {
      return createFailure('選択された時間帯は既に予約されています。別の時間帯をお選びください。')
    }
    throw error // その他のエラーは再スロー
  }

  // メール送信（オプション）
  if (sendEmail) {
    const emailData = {
      reservationId: result.id,
      customerEmail: result.customer.email,
      customerName: `${result.customer.lastName} ${result.customer.firstName}`,
      spaceName: space.name,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice: calculatedPrice,
      notes: notes || undefined,
      location: space.address ?? undefined,
    }

    // カレンダー同期用データ
    const calendarData: ReservationSyncData = {
      reservationId: result.id,
      spaceName: space.name,
      customerName: `${result.customer.lastName} ${result.customer.firstName}`,
      customerEmail: result.customer.email,
      startTime: startDateTime,
      endTime: endDateTime,
      location: space.address ?? undefined,
      notes: notes ?? undefined,
      totalPrice: calculatedPrice,
    }

    // メール送信 + カレンダー同期（バックグラウンド）
    fireAndForget(
      Promise.all([
        sendReservationConfirmationEmail(emailData),
        sendReservationAdminNotification(emailData, 'new'),
        syncReservationToCalendar(calendarData),
      ]),
      {
        operation: 'createAdminReservationPostTasks',
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { reservationId: result.id },
      }
    )
  } else {
    // メール送信しない場合でもカレンダー同期は行う
    const calendarData: ReservationSyncData = {
      reservationId: result.id,
      spaceName: space.name,
      customerName: `${result.customer.lastName} ${result.customer.firstName}`,
      customerEmail: result.customer.email,
      startTime: startDateTime,
      endTime: endDateTime,
      location: space.address ?? undefined,
      notes: notes ?? undefined,
      totalPrice: calculatedPrice,
    }
    fireAndForget(
      syncReservationToCalendar(calendarData),
      {
        operation: 'syncReservationToCalendar',
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { reservationId: result.id, trigger: 'createAdminReservation' },
      }
    )
  }

  updateTag(CACHE_TAGS.RESERVATIONS)
  updateTag(getCacheTag.reservations.calendar())

  return createSuccess('予約を作成しました', { id: result.id })
})

/**
 * 予約作成用スペース一覧取得
 */
export async function getSpacesForReservation(): Promise<
  { id: string; name: string; hourlyPrice: number }[]
> {
  const hasPermissionResult = await checkReadPermission()
  if (!hasPermissionResult) {
    return []
  }

  const spaces = await prisma.space.findMany({
    where: { isActive: true, isPublished: true },
    select: { id: true, name: true, hourlyPrice: true },
    orderBy: { name: 'asc' },
  })

  return toPlainArray(spaces)
}

// =============================================================================
// Admin Reservation Update
// =============================================================================

/**
 * 管理者用予約更新
 *
 * 全項目（スペース・日時・顧客・クーポン・料金・ステータス・メモ）を更新する。
 * 重複チェックは自分自身を除外して実施。
 * クーポン変更時は使用回数をアトミックに調整する。
 */
export const updateAdminReservation = withPermission<
  [id: string, input: UpdateReservationInput],
  void
>(
  'reservation',
  'update'
)(async (_user, id, input): Promise<ActionResult<void>> => {
  // バリデーション
  const validation = updateReservationSchema.safeParse(input)
  if (!validation.success) {
    return createFailure('入力内容に誤りがあります', extractFieldErrors(validation.error))
  }

  const {
    spaceId,
    date,
    startTime,
    endTime,
    customerId,
    totalPrice,
    couponCode,
    status,
    notes,
    sendNotificationEmail,
  } = validation.data

  const startDateTime = new Date(`${date}T${startTime}:00`)
  const endDateTime = new Date(`${date}T${endTime}:00`)

  // 現在の予約・スペース・設定を並列取得
  const [currentReservation, space, settings] = await Promise.all([
    prisma.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        couponId: true,
        googleCalendarEventId: true,
        customer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
    prisma.space.findUnique({
      where: { id: spaceId, isActive: true },
      select: { id: true, name: true, address: true, hourlyPrice: true },
    }),
    prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: {
        durationDiscountEnabled: true,
        durationDiscountRules: true,
        discountCombinationMode: true,
      },
    }),
  ])

  if (!currentReservation) {
    return createFailure('予約が見つかりません')
  }
  if (!space) {
    return createFailure('指定されたスペースが見つかりません')
  }

  // 重複チェック（自分を除く）
  const overlapCheck = await checkReservationOverlap({
    spaceId,
    startTime: startDateTime,
    endTime: endDateTime,
    excludeReservationId: id,
  })
  if (overlapCheck.hasOverlap) {
    return createFailure(
      '選択された時間帯は既に予約されています。別の時間帯をお選びください。'
    )
  }

  // 料金計算
  const hours = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60)
  const hourlyPrice = space.hourlyPrice
  const basePrice = Math.floor(hourlyPrice * hours)

  // クーポン検証
  let validatedCoupon: Parameters<typeof calculateReservationPrice>[0]['coupon'] = null
  let newCouponId: string | null = null

  if (couponCode && couponCode.trim()) {
    const couponResult = await validateCouponCode(couponCode, basePrice)
    if (!couponResult.success) {
      return createFailure(couponResult.error)
    }
    validatedCoupon = couponResult.data?.coupon ?? null
    newCouponId = validatedCoupon?.id ?? null
  }

  const priceCalculation = calculateReservationPrice({
    hourlyPrice,
    hours,
    durationRules: parseDurationDiscountRules(settings?.durationDiscountRules),
    durationDiscountEnabled: settings?.durationDiscountEnabled ?? false,
    coupon: validatedCoupon,
    combinationMode: getValidDiscountCombinationMode(settings?.discountCombinationMode),
    showWarning: false,
  })

  const calculatedPrice = totalPrice ?? priceCalculation.totalPrice
  const couponDiscountAmount =
    priceCalculation.couponDiscount > 0 ? priceCalculation.couponDiscount : null
  const durationDiscountAmount =
    priceCalculation.durationDiscount > 0 ? priceCalculation.durationDiscount : null

  const oldCouponId = currentReservation.couponId
  const couponChanged = oldCouponId !== newCouponId

  // トランザクション更新
  try {
    await prisma.$transaction(async (tx) => {
      // Race Condition防止: トランザクション内で再チェック
      const overlapCheckTx = await checkReservationOverlap(
        { spaceId, startTime: startDateTime, endTime: endDateTime, excludeReservationId: id },
        tx
      )
      if (overlapCheckTx.hasOverlap) {
        throw new ReservationOverlapError()
      }

      await tx.reservation.update({
        where: { id },
        data: {
          spaceId,
          customerId,
          startTime: startDateTime,
          endTime: endDateTime,
          status,
          totalPrice: calculatedPrice,
          basePrice,
          couponId: newCouponId,
          couponDiscountAmount,
          durationDiscountAmount,
          notes: notes || null,
        },
      })

      // クーポン使用回数をアトミックに調整
      if (couponChanged) {
        if (oldCouponId) {
          await decrementCouponUsage(oldCouponId)
        }
        if (newCouponId) {
          await incrementCouponUsage(newCouponId)
        }
      }
    })
  } catch (error) {
    if (isReservationOverlapError(error)) {
      return createFailure(
        '選択された時間帯は既に予約されています。別の時間帯をお選びください。'
      )
    }
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'updateAdminReservation', reservationId: id },
    })
    return createFailure('予約の更新に失敗しました')
  }

  updateTag(CACHE_TAGS.RESERVATIONS)

  // Googleカレンダー更新（バックグラウンド）
  const calendarData: ReservationSyncData = {
    reservationId: id,
    spaceName: space.name,
    customerName: `${currentReservation.customer.lastName} ${currentReservation.customer.firstName}`,
    customerEmail: currentReservation.customer.email,
    startTime: startDateTime,
    endTime: endDateTime,
    location: space.address ?? undefined,
    notes: notes ?? undefined,
    totalPrice: calculatedPrice,
  }

  if (currentReservation.googleCalendarEventId) {
    fireAndForget(
      updateCalendarSync(calendarData, currentReservation.googleCalendarEventId),
      {
        operation: 'updateCalendarSync',
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { reservationId: id },
      }
    )
  } else {
    fireAndForget(
      syncReservationToCalendar(calendarData),
      {
        operation: 'syncReservationToCalendar',
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { reservationId: id, trigger: 'updateAdminReservation' },
      }
    )
  }

  // 変更通知メール（オプション）
  if (sendNotificationEmail) {
    fireAndForget(
      sendReservationConfirmationEmail({
        reservationId: id,
        customerEmail: currentReservation.customer.email,
        customerName: `${currentReservation.customer.lastName} ${currentReservation.customer.firstName}`,
        spaceName: space.name,
        startTime: startDateTime,
        endTime: endDateTime,
        totalPrice: calculatedPrice,
        notes: notes ?? undefined,
        location: space.address ?? undefined,
      }),
      {
        operation: 'sendNotificationEmail',
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { reservationId: id },
      }
    )
  }

  return createSuccess('予約を更新しました')
})
