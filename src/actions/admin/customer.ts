'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { CustomerStatus, ReservationStatus } from '@/lib/validations/enums'
import { z } from 'zod'
import {
  createSuccess,
  createFailure,
  withPermission,
  type ActionResult,
  type CustomerWhereInput,
} from '@/types'
import { getSession, getRoleFromSession } from '@/lib/auth'
import { hasPermission, canAccessAdmin } from '@/lib/permissions'
import { logPermissionDenied } from '@/lib/audit'

// =============================================================================
// Types
// =============================================================================

export type CustomerData = {
  id: string
  lastName: string
  firstName: string
  email: string
  phoneNumber: string | null
  address: string | null
  status: CustomerStatus
  notes: string | null
  totalReservations: number
  totalSpent: number | null
  lastReservationAt: Date | null
  firstReservationAt: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export type CustomerWithReservations = CustomerData & {
  reservations: {
    id: string
    startTime: Date
    endTime: Date
    status: ReservationStatus
    totalPrice: number | null
    space: {
      id: string
      name: string
    }
  }[]
}

export type GetCustomersResult = {
  customers: CustomerData[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type CustomerFilters = {
  status?: CustomerStatus | 'ALL'
  search?: string
  isActive?: boolean
}

export type CustomerPagination = {
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'lastName' | 'totalReservations' | 'lastReservationAt'
  sortOrder?: 'asc' | 'desc'
}

// =============================================================================
// Schemas
// =============================================================================

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['NEW', 'REGULAR', 'VIP', 'INACTIVE', 'BLACKLIST']),
})

const updateNotesSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(2000).nullable(),
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
  if (!hasPermission(role, 'customer', 'read')) {
    void logPermissionDenied(session.user.id, 'customer', 'read')
    return false
  }
  return true
}

// =============================================================================
// Actions
// =============================================================================

/**
 * 顧客一覧を取得
 */
export async function getCustomers(
  filters: CustomerFilters = {},
  pagination: CustomerPagination = {}
): Promise<GetCustomersResult> {
  if (!(await checkReadPermission())) {
    return { customers: [], total: 0, page: 1, limit: 10, totalPages: 0 }
  }

  const { status, search, isActive } = filters

  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = pagination

  // Where条件を構築
  const where: CustomerWhereInput = {}

  if (status && status !== 'ALL') {
    where.status = status
  }

  if (typeof isActive === 'boolean') {
    where.isActive = isActive
  }

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phoneNumber: { contains: search, mode: 'insensitive' } },
    ]
  }

  // 総件数を取得
  const total = await prisma.customer.count({ where })

  // 顧客一覧を取得
  const customers = await prisma.customer.findMany({
    where,
    orderBy: {
      [sortBy]: sortOrder,
    },
    skip: (page - 1) * limit,
    take: limit,
  })

  // Decimal型をnumber型に変換
  const formattedCustomers: CustomerData[] = customers.map((c) => ({
    ...c,
    totalSpent: c.totalSpent ? Number(c.totalSpent) : null,
  }))

  return {
    customers: formattedCustomers,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * 顧客詳細を取得（予約履歴付き）
 */
export async function getCustomerById(id: string): Promise<CustomerWithReservations | null> {
  if (!(await checkReadPermission())) {
    return null
  }

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      reservations: {
        include: {
          space: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          startTime: 'desc',
        },
        take: 20,
      },
    },
  })

  if (!customer) return null

  return {
    ...customer,
    totalSpent: customer.totalSpent ? Number(customer.totalSpent) : null,
    reservations: customer.reservations.map((r) => ({
      id: r.id,
      startTime: r.startTime,
      endTime: r.endTime,
      status: r.status,
      totalPrice: r.totalPrice ? Number(r.totalPrice) : null,
      space: r.space,
    })),
  }
}

/**
 * 顧客ステータスを更新
 */
export const updateCustomerStatus = withPermission<[id: string, status: CustomerStatus], void>(
  'customer',
  'update'
)(async (_user, id, status): Promise<ActionResult<void>> => {
  const parsed = updateStatusSchema.safeParse({ id, status })
  if (!parsed.success) {
    return createFailure('入力が不正です')
  }

  const customer = await prisma.customer.findUnique({
    where: { id },
  })

  if (!customer) {
    return createFailure('顧客が見つかりません')
  }

  await prisma.customer.update({
    where: { id },
    data: { status },
  })

  revalidatePath('/admin/customers')
  revalidatePath(`/admin/customers/${id}`)

  return createSuccess('ステータスを更新しました')
})

/**
 * 顧客メモを更新
 */
export const updateCustomerNotes = withPermission<[id: string, notes: string | null], void>(
  'customer',
  'update'
)(async (_user, id, notes): Promise<ActionResult<void>> => {
  const parsed = updateNotesSchema.safeParse({ id, notes })
  if (!parsed.success) {
    return createFailure('入力が不正です')
  }

  const customer = await prisma.customer.findUnique({
    where: { id },
  })

  if (!customer) {
    return createFailure('顧客が見つかりません')
  }

  await prisma.customer.update({
    where: { id },
    data: { notes },
  })

  revalidatePath('/admin/customers')
  revalidatePath(`/admin/customers/${id}`)

  return createSuccess('メモを更新しました')
})

/**
 * 顧客のアクティブ状態を切り替え
 */
export const toggleCustomerActive = withPermission<[id: string], void>(
  'customer',
  'update'
)(async (_user, id): Promise<ActionResult<void>> => {
  const customer = await prisma.customer.findUnique({
    where: { id },
  })

  if (!customer) {
    return createFailure('顧客が見つかりません')
  }

  await prisma.customer.update({
    where: { id },
    data: { isActive: !customer.isActive },
  })

  revalidatePath('/admin/customers')
  revalidatePath(`/admin/customers/${id}`)

  return createSuccess('アクティブ状態を変更しました')
})

/**
 * 顧客統計情報を取得
 */
export async function getCustomerStats(): Promise<{
  total: number
  new: number
  regular: number
  vip: number
  inactive: number
  blacklist: number
}> {
  if (!(await checkReadPermission())) {
    return { total: 0, new: 0, regular: 0, vip: 0, inactive: 0, blacklist: 0 }
  }

  const [total, newCount, regular, vip, inactive, blacklist] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { status: 'NEW' } }),
    prisma.customer.count({ where: { status: 'REGULAR' } }),
    prisma.customer.count({ where: { status: 'VIP' } }),
    prisma.customer.count({ where: { status: 'INACTIVE' } }),
    prisma.customer.count({ where: { status: 'BLACKLIST' } }),
  ])

  return {
    total,
    new: newCount,
    regular,
    vip,
    inactive,
    blacklist,
  }
}
