'use server'

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { Role } from '@/shared/generated/prisma/enums'
import type { Prisma } from '@/shared/generated/prisma/client'
import { hashPassword } from 'better-auth/crypto'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { withPermission, withRole } from '@/admin/lib/server-action-helpers'
import { type User } from '@/shared/lib/auth'
import { checkReadPermissionFor } from '@/admin/lib/permissions'
import { logRoleChange } from '@/admin/lib/audit'

// Types and schemas from centralized validation file
import {
  createUserSchema,
  updateUserSchema,
  type UserData,
  type UserListParams,
  type UserListResult,
  type CreateUserInput,
  type UpdateUserInput,
} from '@/admin/lib/validations/user'

// Re-export types for consumers
export type {
  UserData,
  UserListParams,
  UserListResult,
  CreateUserInput,
  UpdateUserInput,
} from '@/admin/lib/validations/user'

// =============================================================================
// Helper Functions
// =============================================================================

const checkReadPermission = checkReadPermissionFor('user')

// =============================================================================
// Actions
// =============================================================================

/**
 * ユーザー一覧を取得
 */
export async function getUsers(params: UserListParams = {}): Promise<UserListResult> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return { users: [], total: 0, page: 1, perPage: 20, totalPages: 0 }
  }

  const {
    page = 1,
    perPage = 20,
    search,
    role,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params

  const where = {
    AND: [
      search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
      role && role !== 'ALL' ? { role } : {},
    ],
  } satisfies Prisma.UserWhereInput

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        _count: {
          select: {
            reservations: true,
            posts: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.user.count({ where }),
  ])

  return {
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      image: user.image,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      _count: user._count,
    })),
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  }
}

/**
 * ユーザー詳細を取得
 */
export async function getUser(id: string): Promise<UserData | null> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          reservations: true,
          posts: true,
        },
      },
    },
  })

  if (!user) return null

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
    image: user.image,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    _count: user._count,
  }
}

/**
 * ユーザーを作成
 */
export const createUser = withPermission<[CreateUserInput], { id: string }>(
  'user',
  'create'
)(async (_user: User, data: CreateUserInput): Promise<ActionResult<{ id: string }>> => {
  const parsed = createUserSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  // メールアドレスの重複チェック
  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  })

  if (existing) {
    return createFailure('このメールアドレスは既に使用されています')
  }

  // パスワードをハッシュ化（Better Auth デフォルトの scrypt を使用）
  const hashedPassword = await hashPassword(parsed.data.password)

  // Better Auth: UserとAccountを同時に作成
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      accounts: {
        create: {
          accountId: parsed.data.email, // credentialの場合はemailをaccountIdに
          providerId: 'credential',
          password: hashedPassword,
        },
      },
    },
  })

  updateTag(CACHE_TAGS.STAFF)

  return createSuccess('ユーザーを作成しました', { id: user.id })
})

/**
 * ユーザーを更新
 */
export const updateUser = withPermission<[string, UpdateUserInput], void>(
  'user',
  'update'
)(async (_user: User, id: string, data: UpdateUserInput): Promise<ActionResult<void>> => {
  const parsed = updateUserSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  })

  if (!existing) {
    return createFailure('ユーザーが見つかりません')
  }

  // メールアドレスの重複チェック（自身を除く）
  const duplicate = await prisma.user.findFirst({
    where: {
      email: parsed.data.email,
      NOT: { id },
    },
    select: { id: true },
  })

  if (duplicate) {
    return createFailure('このメールアドレスは既に使用されています')
  }

  const updateData: {
    email: string
    name: string
    role: Role
    password?: string
  } = {
    email: parsed.data.email,
    name: parsed.data.name,
    role: parsed.data.role,
  }

  // パスワードが入力された場合のみ更新（Better Auth デフォルトの scrypt を使用）
  if (parsed.data.password && parsed.data.password.length >= 8) {
    updateData.password = await hashPassword(parsed.data.password)
  }

  await prisma.user.update({
    where: { id },
    data: updateData,
  })

  updateTag(CACHE_TAGS.STAFF)
  updateTag(getCacheTag.staff.detail(id))

  return createSuccess('ユーザーを更新しました')
})

/**
 * ユーザーを削除
 */
export const deleteUser = withPermission<[string], void>(
  'user',
  'delete'
)(async (user: User, id: string): Promise<ActionResult<void>> => {
  // 自分自身は削除できない
  if (user.id === id) {
    return createFailure('自分自身を削除することはできません')
  }

  const targetUser = await prisma.user.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          reservations: true,
          posts: true,
        },
      },
    },
  })

  if (!targetUser) {
    return createFailure('ユーザーが見つかりません')
  }

  // 関連データがある場合は警告
  if (targetUser._count.reservations > 0 || targetUser._count.posts > 0) {
    return createFailure(
      `このユーザーには予約${targetUser._count.reservations}件、投稿${targetUser._count.posts}件が関連付けられています。先に関連データを削除してください`
    )
  }

  await prisma.user.delete({
    where: { id },
  })

  updateTag(CACHE_TAGS.STAFF)

  return createSuccess('ユーザーを削除しました')
})

/**
 * ユーザーのロールを変更（SUPER_ADMIN専用）
 */
export const updateUserRole = withRole<[string, Role], void>(Role.SUPER_ADMIN)(
  async (user: User, id: string, role: Role): Promise<ActionResult<void>> => {
    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    })

    if (!targetUser) {
      return createFailure('ユーザーが見つかりません')
    }

    const oldRole = targetUser.role

    await prisma.user.update({
      where: { id },
      data: { role },
    })

    // ロール変更を監査ログに記録（withRoleは自動監査なし）
    void logRoleChange(user.id, id, oldRole, role)

    updateTag(CACHE_TAGS.STAFF)
    updateTag(getCacheTag.staff.detail(id))

    return createSuccess('ロールを更新しました')
  }
)

/**
 * ユーザー統計を取得
 */
export async function getUserStats(): Promise<{
  total: number
  admins: number
  users: number
  recentUsers: number
}> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return { total: 0, admins: 0, users: 0, recentUsers: 0 }
  }

  const [total, admins, users, recentUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: { in: [Role.SUPER_ADMIN, Role.ADMIN] } } }),
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.user.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30日以内
        },
      },
    }),
  ])

  return { total, admins, users, recentUsers }
}
