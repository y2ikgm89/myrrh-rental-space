'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { InquiryStatus } from '@/generated/prisma/client/enums'
import { z } from 'zod'
import { type ActionResult, createSuccess, createFailure, type InquiryWhereInput } from '@/types'

// =============================================================================
// Types
// =============================================================================

export type InquiryData = {
  id: string
  name: string
  email: string
  subject: string
  message: string
  status: InquiryStatus
  createdAt: Date
  updatedAt: Date
}

export type GetInquiriesResult = {
  inquiries: InquiryData[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type InquiryFilters = {
  status?: InquiryStatus | 'ALL'
  search?: string
}

export type InquiryPagination = {
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
}

// =============================================================================
// Schemas
// =============================================================================

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
})

// =============================================================================
// Actions
// =============================================================================

/**
 * お問い合わせ一覧を取得
 */
export async function getInquiries(
  filters: InquiryFilters = {},
  pagination: InquiryPagination = {}
): Promise<GetInquiriesResult> {
  const { status, search } = filters

  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = pagination

  // Where条件を構築
  const where: InquiryWhereInput = {}

  if (status && status !== 'ALL') {
    where.status = status
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
      { message: { contains: search, mode: 'insensitive' } },
    ]
  }

  // 総件数を取得
  const total = await prisma.inquiry.count({ where })

  // お問い合わせ一覧を取得
  const inquiries = await prisma.inquiry.findMany({
    where,
    orderBy: {
      [sortBy]: sortOrder,
    },
    skip: (page - 1) * limit,
    take: limit,
  })

  return {
    inquiries,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * お問い合わせ詳細を取得
 */
export async function getInquiryById(id: string): Promise<InquiryData | null> {
  return prisma.inquiry.findUnique({
    where: { id },
  })
}

/**
 * お問い合わせステータスを更新
 */
export async function updateInquiryStatus(
  id: string,
  status: InquiryStatus
): Promise<ActionResult<void>> {
  try {
    const parsed = updateStatusSchema.safeParse({ id, status })
    if (!parsed.success) {
      return createFailure('入力が不正です')
    }

    const inquiry = await prisma.inquiry.findUnique({
      where: { id },
    })

    if (!inquiry) {
      return createFailure('お問い合わせが見つかりません')
    }

    await prisma.inquiry.update({
      where: { id },
      data: { status },
    })

    revalidatePath('/admin/inquiries')
    revalidatePath(`/admin/inquiries/${id}`)

    return createSuccess('ステータスを更新しました')
  } catch (error) {
    console.error('Failed to update inquiry status:', error)
    return createFailure('ステータスの更新に失敗しました')
  }
}

/**
 * お問い合わせを削除
 */
export async function deleteInquiry(
  id: string
): Promise<ActionResult<void>> {
  try {
    const inquiry = await prisma.inquiry.findUnique({
      where: { id },
    })

    if (!inquiry) {
      return createFailure('お問い合わせが見つかりません')
    }

    await prisma.inquiry.delete({
      where: { id },
    })

    revalidatePath('/admin/inquiries')

    return createSuccess('お問い合わせを削除しました')
  } catch (error) {
    console.error('Failed to delete inquiry:', error)
    return createFailure('お問い合わせの削除に失敗しました')
  }
}

/**
 * 統計情報を取得（ダッシュボード用）
 */
export async function getInquiryStats(): Promise<{
  total: number
  new: number
  inProgress: number
  resolved: number
  closed: number
}> {
  const [total, newCount, inProgress, resolved, closed] = await Promise.all([
    prisma.inquiry.count(),
    prisma.inquiry.count({ where: { status: 'NEW' } }),
    prisma.inquiry.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.inquiry.count({ where: { status: 'RESOLVED' } }),
    prisma.inquiry.count({ where: { status: 'CLOSED' } }),
  ])

  return {
    total,
    new: newCount,
    inProgress,
    resolved,
    closed,
  }
}
