'use server'

import { connection } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

// =============================================================================
// Types
// =============================================================================

export type DashboardStats = {
  reservations: {
    thisMonth: number
    lastMonth: number
    changePercent: number
  }
  revenue: {
    thisMonth: number
    lastMonth: number
    changePercent: number
  }
  inquiries: {
    new: number
    thisMonth: number
  }
  spaces: {
    active: number
    total: number
  }
}

export type RecentReservation = {
  id: string
  spaceName: string
  customerName: string
  startTime: Date
  endTime: Date
  status: string
  totalPrice: number | null
}

export type RecentInquiry = {
  id: string
  name: string
  email: string
  subject: string
  status: string
  createdAt: Date
}

// =============================================================================
// Actions
// =============================================================================

/**
 * ダッシュボード統計を取得
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  await requireAdmin()
  await connection()

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

  const [
    thisMonthReservations,
    lastMonthReservations,
    thisMonthRevenue,
    lastMonthRevenue,
    newInquiries,
    thisMonthInquiries,
    activeSpaces,
    totalSpaces,
  ] = await Promise.all([
    // 今月の予約数
    prisma.reservation.count({
      where: {
        createdAt: { gte: thisMonthStart },
        status: { not: 'CANCELLED' },
      },
    }),
    // 先月の予約数
    prisma.reservation.count({
      where: {
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
        status: { not: 'CANCELLED' },
      },
    }),
    // 今月の売上
    prisma.reservation.aggregate({
      where: {
        createdAt: { gte: thisMonthStart },
        status: 'CONFIRMED',
      },
      _sum: { totalPrice: true },
    }),
    // 先月の売上
    prisma.reservation.aggregate({
      where: {
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
        status: 'CONFIRMED',
      },
      _sum: { totalPrice: true },
    }),
    // 新規お問い合わせ（未対応）
    prisma.inquiry.count({
      where: { status: 'NEW' },
    }),
    // 今月のお問い合わせ
    prisma.inquiry.count({
      where: { createdAt: { gte: thisMonthStart } },
    }),
    // アクティブスペース
    prisma.space.count({
      where: { isPublished: true, isActive: true },
    }),
    // 全スペース
    prisma.space.count(),
  ])

  // 変化率の計算
  const reservationChange = lastMonthReservations > 0
    ? Math.round(((thisMonthReservations - lastMonthReservations) / lastMonthReservations) * 100)
    : thisMonthReservations > 0 ? 100 : 0

  const thisMonthRevenueValue = Number(thisMonthRevenue._sum.totalPrice || 0)
  const lastMonthRevenueValue = Number(lastMonthRevenue._sum.totalPrice || 0)
  const revenueChange = lastMonthRevenueValue > 0
    ? Math.round(((thisMonthRevenueValue - lastMonthRevenueValue) / lastMonthRevenueValue) * 100)
    : thisMonthRevenueValue > 0 ? 100 : 0

  return {
    reservations: {
      thisMonth: thisMonthReservations,
      lastMonth: lastMonthReservations,
      changePercent: reservationChange,
    },
    revenue: {
      thisMonth: thisMonthRevenueValue,
      lastMonth: lastMonthRevenueValue,
      changePercent: revenueChange,
    },
    inquiries: {
      new: newInquiries,
      thisMonth: thisMonthInquiries,
    },
    spaces: {
      active: activeSpaces,
      total: totalSpaces,
    },
  }
}

/**
 * 最近の予約を取得
 */
export async function getRecentReservations(limit = 5): Promise<RecentReservation[]> {
  await requireAdmin()

  const reservations = await prisma.reservation.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      space: { select: { name: true } },
      customer: { select: { lastName: true, firstName: true } },
    },
  })

  return reservations.map((r) => ({
    id: r.id,
    spaceName: r.space.name,
    customerName: `${r.customer.lastName} ${r.customer.firstName}`,
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    totalPrice: r.totalPrice ? Number(r.totalPrice) : null,
  }))
}

/**
 * 最近のお問い合わせを取得
 */
export async function getRecentInquiries(limit = 5): Promise<RecentInquiry[]> {
  await requireAdmin()

  const inquiries = await prisma.inquiry.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
  })

  return inquiries.map((i) => ({
    id: i.id,
    name: i.name,
    email: i.email,
    subject: i.subject,
    status: i.status,
    createdAt: i.createdAt,
  }))
}

/**
 * 今日の予約を取得
 */
export async function getTodayReservations(): Promise<RecentReservation[]> {
  await requireAdmin()
  await connection()

  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

  const reservations = await prisma.reservation.findMany({
    where: {
      startTime: { gte: todayStart, lte: todayEnd },
      status: { not: 'CANCELLED' },
    },
    orderBy: { startTime: 'asc' },
    include: {
      space: { select: { name: true } },
      customer: { select: { lastName: true, firstName: true } },
    },
  })

  return reservations.map((r) => ({
    id: r.id,
    spaceName: r.space.name,
    customerName: `${r.customer.lastName} ${r.customer.firstName}`,
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    totalPrice: r.totalPrice ? Number(r.totalPrice) : null,
  }))
}
