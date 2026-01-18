'use server'

import { prisma } from '@/shared/lib/prisma'
import { revalidatePath } from 'next/cache'
import { ReservationStatus } from '@/shared/generated/prisma/enums'
import { z } from 'zod'
import {
  sendReservationConfirmationEmail,
  sendReservationCancelledEmail,
  sendReservationAdminNotification,
} from '@/shared/lib/email-service'
import { createSuccess, createFailure, withPermission, type ActionResult } from '@/admin/types/server-actions'
import type { ReservationWhereInput } from '@/shared/types/prisma'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { syncReservationToCalendar, updateCalendarSync, deleteCalendarSync, type ReservationSyncData } from '@/shared/lib/calendar-sync'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logPermissionDenied } from '@/admin/lib/audit'
import { checkReservationOverlap } from '@/public/lib/reservation-utils'
import { adminReservationSchema, type AdminReservationInput } from '@/admin/lib/validations/admin-reservation'
import { extractFieldErrors } from '@/shared/lib/action-helpers'

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

/**
 * 読み取り権限チェックヘルパー
 */
async function checkReadPermission(): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  const role = getRoleFromSession(session)
  if (!role) return false
  if (!canAccessAdmin(role)) return false
  if (!hasPermission(role, 'reservation', 'read')) {
    void logPermissionDenied(session.user.id, 'reservation', 'read')
    return false
  }
  return true
}

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

  // 総件数を取得
  const total = await prisma.reservation.count({ where })

  // 予約一覧を取得
  const reservations = await prisma.reservation.findMany({
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
  })

  // Decimal型をnumber型に変換
  const formattedReservations: ReservationWithRelations[] = reservations.map((r) => ({
    ...r,
    totalPrice: r.totalPrice ? Number(r.totalPrice) : null,
  }))

  return {
    reservations: formattedReservations,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
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
    },
  })

  if (!reservation) {
    return null
  }

  return {
    ...reservation,
    totalPrice: reservation.totalPrice ? Number(reservation.totalPrice) : null,
  }
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
    totalPrice: reservation.totalPrice ? Number(reservation.totalPrice) : null,
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
    totalPrice: reservation.totalPrice ? Number(reservation.totalPrice) : null,
  }

  // 確定時: 確認メール送信 + カレンダー同期
  if (status === 'CONFIRMED' && previousStatus !== 'CONFIRMED') {
    // カレンダーイベント更新 or 新規作成（バックグラウンド）
    if (reservation.googleCalendarEventId) {
      // 既存イベントを更新
      updateCalendarSync(calendarData, reservation.googleCalendarEventId).catch((err) => {
        console.error('Calendar update failed:', err)
      })
    } else {
      // イベントがない場合は新規作成（初回同期失敗時のフォールバック）
      syncReservationToCalendar(calendarData).catch((err) => {
        console.error('Calendar create failed:', err)
      })
    }
    await sendReservationConfirmationEmail(emailData)
    await sendReservationAdminNotification(emailData, previousStatus === 'PENDING' ? 'new' : 'update')
  }

  // キャンセル時: キャンセルメール送信 + カレンダー削除
  if (status === 'CANCELLED' && previousStatus !== 'CANCELLED') {
    // カレンダーイベント削除（バックグラウンド）
    if (reservation.googleCalendarEventId) {
      deleteCalendarSync(id, reservation.googleCalendarEventId).catch((err) => {
        console.error('Calendar delete failed:', err)
      })
    }
    await sendReservationCancelledEmail(emailData)
    await sendReservationAdminNotification(emailData, 'cancel')
  }

  revalidatePath('/admin/reservations')
  revalidatePath(`/admin/reservations/${id}`)

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
  })

  if (!reservation) {
    return createFailure('予約が見つかりません')
  }

  await prisma.reservation.update({
    where: { id },
    data: { notes },
  })

  revalidatePath('/admin/reservations')
  revalidatePath(`/admin/reservations/${id}`)

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
  })

  if (!reservation) {
    return createFailure('予約が見つかりません')
  }

  // カレンダーからイベントを削除（バックグラウンド、DB削除前に開始）
  if (reservation.googleCalendarEventId) {
    deleteCalendarSync(id, reservation.googleCalendarEventId).catch((err) => {
      console.error('Calendar delete failed on reservation delete:', err)
    })
  }

  await prisma.reservation.delete({
    where: { id },
  })

  revalidatePath('/admin/reservations')

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
    totalPrice: r.totalPrice ? Number(r.totalPrice) : null,
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
    status,
    notes,
    sendEmail,
  } = validation.data

  // 日時を Date オブジェクトに変換
  const startDateTime = new Date(`${date}T${startTime}:00`)
  const endDateTime = new Date(`${date}T${endTime}:00`)

  // スペースの存在確認と料金情報取得
  const space = await prisma.space.findUnique({
    where: { id: spaceId, isActive: true },
    select: { id: true, name: true, address: true, hourlyPrice: true },
  })

  if (!space) {
    return createFailure('指定されたスペースが見つかりません')
  }

  // 予約重複チェック
  const overlapCheck = await checkReservationOverlap({
    spaceId,
    startTime: startDateTime,
    endTime: endDateTime,
  })

  if (overlapCheck.hasOverlap) {
    return createFailure('選択された時間帯は既に予約されています。別の時間帯をお選びください。')
  }

  // 料金計算（手動設定がなければ自動計算）
  const hours = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60)
  const calculatedPrice = totalPrice ?? Number(space.hourlyPrice) * hours

  // トランザクションで顧客と予約を作成
  const result = await prisma.$transaction(async (tx) => {
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

    // 予約を作成
    const reservation = await tx.reservation.create({
      data: {
        spaceId,
        customerId: resolvedCustomerId,
        startTime: startDateTime,
        endTime: endDateTime,
        totalPrice: calculatedPrice,
        notes: notes || null,
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

    // 顧客の予約統計を更新
    const customer = await tx.customer.findUnique({
      where: { id: resolvedCustomerId },
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
    Promise.all([
      sendReservationConfirmationEmail(emailData),
      sendReservationAdminNotification(emailData, 'new'),
      syncReservationToCalendar(calendarData),
    ]).catch((err) => {
      console.error('Failed to send reservation emails or sync calendar:', err)
    })
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
    syncReservationToCalendar(calendarData).catch((err) => {
      console.error('Failed to sync calendar:', err)
    })
  }

  revalidatePath('/admin/reservations')
  revalidatePath('/admin/reservations/calendar')

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

  return spaces.map((s) => ({
    ...s,
    hourlyPrice: Number(s.hourlyPrice),
  }))
}
