'use server'

/**
 * 監査ログ Server Actions
 */

import { prisma } from '@/lib/prisma'
import { AuditAction } from '@/generated/prisma/client/enums'
import { createSuccess, createFailure, type ActionResult } from '@/types'
import { getSession, getRoleFromSession } from '@/lib/auth'
import { hasPermission, canAccessAdmin } from '@/lib/permissions'
import { logPermissionDenied } from '@/lib/audit'
import { z } from 'zod'

// =============================================================================
// Types
// =============================================================================

export type AuditLogItem = {
  id: string
  userId: string | null
  action: AuditAction
  resource: string
  resourceId: string | null
  oldValue: unknown
  newValue: unknown
  metadata: {
    ipAddress?: string
    userAgent?: string
    [key: string]: unknown
  } | null
  createdAt: Date
  user: {
    id: string
    name: string | null
    email: string
  } | null
}

export type AuditLogFilters = {
  page?: number
  perPage?: number
  action?: AuditAction | 'ALL'
  resource?: string
  userId?: string
  dateFrom?: string
  dateTo?: string
}

export type AuditLogResult = {
  logs: AuditLogItem[]
  total: number
  page: number
  totalPages: number
}

export type AuditLogStats = {
  total: number
  today: number
  securityEvents: number
  byAction: Record<string, number>
}

// =============================================================================
// Validation
// =============================================================================

const filtersSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  perPage: z.number().int().positive().max(100).optional().default(50),
  action: z.nativeEnum(AuditAction).or(z.literal('ALL')).optional(),
  resource: z.string().optional(),
  userId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * 監査ログ権限チェック
 */
async function checkAuditLogPermission(): Promise<{ user: { id: string } } | { error: string }> {
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

  if (!hasPermission(role, 'auditLog', 'read')) {
    void logPermissionDenied(session.user.id, 'auditLog', 'read')
    return { error: '監査ログの閲覧権限がありません' }
  }

  return { user: { id: session.user.id } }
}

// =============================================================================
// Actions
// =============================================================================

/**
 * 監査ログ一覧を取得
 */
export async function getAuditLogs(filters: AuditLogFilters = {}): Promise<ActionResult<AuditLogResult>> {
  const check = await checkAuditLogPermission()
  if ('error' in check) {
    return createFailure(check.error)
  }

  const validated = filtersSchema.parse(filters)
  const { page, perPage, action, resource, userId, dateFrom, dateTo } = validated

  type AuditLogWhere = {
    action?: AuditAction
    resource?: string
    userId?: string
    createdAt?: { gte?: Date; lte?: Date }
  }
  const where: AuditLogWhere = {}

  if (action && action !== 'ALL') {
    where.action = action
  }

  if (resource) {
    where.resource = resource
  }

  if (userId) {
    where.userId = userId
  }

  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) {
      where.createdAt.gte = new Date(dateFrom)
    }
    if (dateTo) {
      where.createdAt.lte = new Date(dateTo)
    }
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.auditLog.count({ where }),
  ])

  return createSuccess('監査ログを取得しました', {
    logs: logs.map((log) => ({
      ...log,
      metadata: log.metadata as AuditLogItem['metadata'],
    })),
    total,
    page,
    totalPages: Math.ceil(total / perPage),
  })
}

/**
 * 監査ログの統計を取得
 */
export async function getAuditLogStats(): Promise<ActionResult<AuditLogStats>> {
  const check = await checkAuditLogPermission()
  if ('error' in check) {
    return createFailure(check.error)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const securityActions = [
    AuditAction.LOGIN_SUCCESS,
    AuditAction.LOGIN_FAILED,
    AuditAction.PERMISSION_DENIED,
    AuditAction.PASSWORD_CHANGE,
    AuditAction.ROLE_CHANGE,
  ]

  const [total, todayCount, securityEvents, actionCounts] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.count({
      where: { createdAt: { gte: today } },
    }),
    prisma.auditLog.count({
      where: { action: { in: securityActions } },
    }),
    prisma.auditLog.groupBy({
      by: ['action'],
      _count: { action: true },
    }),
  ])

  const byAction: Record<string, number> = {}
  for (const item of actionCounts) {
    byAction[item.action] = item._count.action
  }

  return createSuccess('統計を取得しました', {
    total,
    today: todayCount,
    securityEvents,
    byAction,
  })
}

/**
 * リソース一覧を取得（フィルター用）
 */
export async function getAuditLogResources(): Promise<ActionResult<string[]>> {
  const check = await checkAuditLogPermission()
  if ('error' in check) {
    return createFailure(check.error)
  }

  const resources = await prisma.auditLog.findMany({
    select: { resource: true },
    distinct: ['resource'],
    orderBy: { resource: 'asc' },
  })

  return createSuccess('リソース一覧を取得しました', resources.map((r) => r.resource))
}
