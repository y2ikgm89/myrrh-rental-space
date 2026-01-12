'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { ReservationStatus } from '@/generated/prisma/client/enums'
import { z } from 'zod'
import {
  sendReservationConfirmationEmail,
  sendReservationCancelledEmail,
  sendReservationAdminNotification,
} from '@/lib/email-service'
import { createSuccess, createFailure, type ReservationWhereInput, withAuth } from '@/types'
import { verifyAdminSession } from '@/lib/auth'
import { syncReservationToCalendar, updateCalendarSync, deleteCalendarSync, type ReservationSyncData } from '@/lib/calendar-sync'

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
// Actions
// =============================================================================

/**
 * 予約一覧を取得
 */
export async function getReservations(
  filters: ReservationFilters = {},
  pagination: ReservationPagination = {}
): Promise<GetReservationsResult> {
  await verifyAdminSession()

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
  await verifyAdminSession()

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
export const updateReservationStatus = withAuth(async (
  _user,
  id: string,
  status: ReservationStatus
) => {
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
export const updateReservationNotes = withAuth(async (
  _user,
  id: string,
  notes: string | null
) => {
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
export const deleteReservation = withAuth(async (_user, id: string) => {
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
  await verifyAdminSession()

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
  await verifyAdminSession()

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
  await verifyAdminSession()

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
