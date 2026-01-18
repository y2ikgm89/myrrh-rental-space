'use server'

import { prisma } from '@/shared/lib/prisma'
import { revalidatePath } from 'next/cache'
import { Role } from '@/shared/generated/prisma/enums'
import type { Prisma } from '@/shared/generated/prisma/client'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { createSuccess, createFailure, withPermission, withRole, type ActionResult } from '@/admin/types/server-actions'
import { getSession, getRoleFromSession, type User } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { logRoleChange, logPermissionDenied } from '@/admin/lib/audit'

// =============================================================================
// Types
// =============================================================================

export type UserData = {
  id: string
  email: string
  name: string
  role: Role
  emailVerified: boolean
  image: string | null
  createdAt: Date
  updatedAt: Date
  _count: {
    reservations: number
    blogPosts: number
  }
}

export type UserListParams = {
  page?: number
  perPage?: number
  search?: string
  role?: Role | 'ALL'
  sortBy?: 'name' | 'email' | 'role' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

export type UserListResult = {
  users: UserData[]
  total: number
  page: number
  perPage: number
  totalPages: number
}

// =============================================================================
// Schemas
// =============================================================================

type RoleValue = 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'VIEWER' | 'USER'
const ROLE_VALUES: readonly RoleValue[] = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER', 'USER']

const createUserSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  password: z.string().min(8, 'パスワードは8文字以上必要です'),
  name: z.string().min(1, '名前は必須です').max(100),
  role: z.enum(ROLE_VALUES),
})

const updateUserSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  name: z.string().min(1, '名前は必須です').max(100),
  role: z.enum(ROLE_VALUES),
  password: z.string().min(8, 'パスワードは8文字以上必要です').optional().or(z.literal('')),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * 読み取り権限チェック（既存パターン維持）
 */
async function checkReadPermission(): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  const role = getRoleFromSession(session)
  if (!role) return false
  if (!canAccessAdmin(role)) return false
  if (!hasPermission(role, 'user', 'read')) {
    void logPermissionDenied(session.user.id, 'user', 'read')
    return false
  }
  return true
}

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
            blogPosts: true,
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
          blogPosts: true,
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
    return createFailure(parsed.error.issues[0].message)
  }

  // メールアドレスの重複チェック
  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  })

  if (existing) {
    return createFailure('このメールアドレスは既に使用されています')
  }

  // パスワードをハッシュ化（Better Auth scrypt format）
  const hashedPassword = await bcrypt.hash(parsed.data.password, 13)

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

  revalidatePath('/admin/users')

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
    return createFailure(parsed.error.issues[0].message)
  }

  const existing = await prisma.user.findUnique({
    where: { id },
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

  // パスワードが入力された場合のみ更新
  if (parsed.data.password && parsed.data.password.length >= 8) {
    updateData.password = await bcrypt.hash(parsed.data.password, 13)
  }

  await prisma.user.update({
    where: { id },
    data: updateData,
  })

  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${id}`)

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
          blogPosts: true,
        },
      },
    },
  })

  if (!targetUser) {
    return createFailure('ユーザーが見つかりません')
  }

  // 関連データがある場合は警告
  if (targetUser._count.reservations > 0 || targetUser._count.blogPosts > 0) {
    return createFailure(
      `このユーザーには予約${targetUser._count.reservations}件、ブログ記事${targetUser._count.blogPosts}件が関連付けられています。先に関連データを削除してください`
    )
  }

  await prisma.user.delete({
    where: { id },
  })

  revalidatePath('/admin/users')

  return createSuccess('ユーザーを削除しました')
})

/**
 * ユーザーのロールを変更（SUPER_ADMIN専用）
 */
export const updateUserRole = withRole<[string, Role], void>(Role.SUPER_ADMIN)(
  async (user: User, id: string, role: Role): Promise<ActionResult<void>> => {
    const targetUser = await prisma.user.findUnique({
      where: { id },
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

    revalidatePath('/admin/users')
    revalidatePath(`/admin/users/${id}`)

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
