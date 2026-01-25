'use server'

/**
 * スタッフ招待 Server Actions
 *
 * 管理者がスタッフを招待し、スタッフ自身がパスワードを設定するフロー。
 * 招待メールを送信し、スタッフが専用リンクからパスワードを設定して
 * アカウントを有効化します。
 *
 * ## 主な機能
 * - スタッフ招待メール送信
 * - 招待トークン検証
 * - パスワード設定（アカウント作成）
 * - 招待一覧取得
 * - 招待削除・再送
 *
 * @module admin/actions/staff-invitation
 */

import { randomBytes } from 'crypto'
import { prisma } from '@/shared/lib/prisma'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { sendStaffInvitationEmail } from '@/shared/lib/email-service'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'
import { getSession, getRoleFromSession, type User } from '@/shared/lib/auth'
import { logPermissionDenied } from '@/admin/lib/audit'
import {
  createInvitationSchema,
  setupPasswordSchema,
  INVITATION_EXPIRY_DAYS,
  type CreateInvitationInput,
  type SetupPasswordInput,
  type InvitationData,
} from '@/admin/lib/validations/staff-invitation'
import { getAppUrl } from '@/shared/lib/constants'
import { logError, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'
import { hashPassword } from 'better-auth/crypto'

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * 読み取り権限チェック
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

/**
 * 安全なトークン生成
 */
function generateToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * 有効期限を計算
 */
function getExpiryDate(): Date {
  const date = new Date()
  date.setDate(date.getDate() + INVITATION_EXPIRY_DAYS)
  return date
}

// =============================================================================
// Actions
// =============================================================================

/**
 * スタッフ招待を送信
 */
export const sendInvitation = withPermission<[CreateInvitationInput], InvitationData>(
  'user',
  'create'
)(async (user: User, input: CreateInvitationInput): Promise<ActionResult<InvitationData>> => {
  // 入力バリデーション
  const validationResult = createInvitationSchema.safeParse(input)
  if (!validationResult.success) {
    return createFailure(validationResult.error.issues[0]?.message ?? '入力が無効です')
  }
  const { email, role, name } = validationResult.data

  // 既存ユーザーチェック
  const existingUser = await prisma.user.findUnique({
    where: { email },
  })
  if (existingUser) {
    return createFailure('このメールアドレスは既に登録されています')
  }

  // 既存の有効な招待チェック
  const existingInvitation = await prisma.staffInvitation.findFirst({
    where: {
      email,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  })
  if (existingInvitation) {
    return createFailure('このメールアドレスには既に有効な招待が存在します。再送する場合は一度削除してください。')
  }

  // 招待作成
  const token = generateToken()
  const invitation = await prisma.staffInvitation.create({
    data: {
      email,
      token,
      role,
      name,
      expiresAt: getExpiryDate(),
      createdBy: user.id,
    },
  })

  // 招待メール送信
  const setupUrl = `${getAppUrl()}/admin/setup/${token}`

  const emailResult = await sendStaffInvitationEmail({
    to: email,
    staffName: name ?? email,
    setupUrl,
    expiresAt: invitation.expiresAt,
  })

  if (!emailResult.success) {
    // メール送信失敗時は招待を削除
    await prisma.staffInvitation.delete({ where: { id: invitation.id } })
    logError(new Error(emailResult.error || 'Failed to send invitation email'), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'sendInvitation', email, invitationId: invitation.id },
    })
    return createFailure('招待メールの送信に失敗しました。メール設定を確認してください。')
  }

  revalidateTag(CACHE_TAGS.STAFF, 'default')
  return createSuccess('招待メールを送信しました', {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    name: invitation.name,
    expiresAt: invitation.expiresAt,
    usedAt: invitation.usedAt,
    createdAt: invitation.createdAt,
  })
})

/**
 * 招待トークンを検証
 */
export async function validateInvitationToken(token: string): Promise<ActionResult<InvitationData>> {
  const invitation = await prisma.staffInvitation.findUnique({
    where: { token },
  })

  if (!invitation) {
    return createFailure('無効な招待リンクです')
  }

  if (invitation.usedAt) {
    return createFailure('この招待は既に使用されています')
  }

  if (invitation.expiresAt < new Date()) {
    return createFailure('この招待は有効期限が切れています')
  }

  return createSuccess('有効な招待です', {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    name: invitation.name,
    expiresAt: invitation.expiresAt,
    usedAt: invitation.usedAt,
    createdAt: invitation.createdAt,
  })
}

/**
 * パスワードを設定してユーザーを作成
 */
export async function setupPassword(input: SetupPasswordInput): Promise<ActionResult<{ userId: string }>> {
  // 入力バリデーション
  const validationResult = setupPasswordSchema.safeParse(input)
  if (!validationResult.success) {
    return createFailure(validationResult.error.issues[0]?.message ?? '入力が無効です')
  }
  const { token, password } = validationResult.data

  // トークン検証
  const invitation = await prisma.staffInvitation.findUnique({
    where: { token },
  })

  if (!invitation) {
    return createFailure('無効な招待リンクです')
  }

  if (invitation.usedAt) {
    return createFailure('この招待は既に使用されています')
  }

  if (invitation.expiresAt < new Date()) {
    return createFailure('この招待は有効期限が切れています')
  }

  // パスワードハッシュ化（Better Auth デフォルトの scrypt を使用）
  const hashedPassword = await hashPassword(password)

  // トランザクションでユーザー作成と招待消費を実行
  const result = await prisma.$transaction(async (tx) => {
    // ユーザー作成
    const newUser = await tx.user.create({
      data: {
        email: invitation.email,
        name: invitation.name ?? invitation.email.split('@')[0] ?? 'スタッフ',
        role: invitation.role,
        emailVerified: true, // 招待メール経由なのでメール認証済み扱い
      },
    })

    // Better Auth用のAccount作成（credential provider）
    await tx.account.create({
      data: {
        userId: newUser.id,
        accountId: newUser.id,
        providerId: 'credential',
        password: hashedPassword,
      },
    })

    // 招待を使用済みにする
    await tx.staffInvitation.update({
      where: { id: invitation.id },
      data: { usedAt: new Date() },
    })

    return newUser
  })

  revalidateTag(CACHE_TAGS.STAFF, 'default')
  return createSuccess('アカウントを作成しました', { userId: result.id })
}

/**
 * 招待一覧を取得（招待中ステータス表示用）
 */
export async function getPendingInvitations(): Promise<InvitationData[]> {
  const hasAccess = await checkReadPermission()
  if (!hasAccess) return []

  const invitations = await prisma.staffInvitation.findMany({
    where: {
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  return invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    name: inv.name,
    expiresAt: inv.expiresAt,
    usedAt: inv.usedAt,
    createdAt: inv.createdAt,
  }))
}

/**
 * 招待を削除（キャンセル）
 */
export const deleteInvitation = withPermission<[string], void>(
  'user',
  'delete'
)(async (_user: User, id: string): Promise<ActionResult<void>> => {
  const invitation = await prisma.staffInvitation.findUnique({
    where: { id },
  })

  if (!invitation) {
    return createFailure('招待が見つかりません')
  }

  if (invitation.usedAt) {
    return createFailure('使用済みの招待は削除できません')
  }

  await prisma.staffInvitation.delete({
    where: { id },
  })

  revalidateTag(CACHE_TAGS.STAFF, 'default')
  return createSuccess('招待を削除しました')
})

/**
 * 招待を再送
 */
export const resendInvitation = withPermission<[string], void>(
  'user',
  'create'
)(async (_user: User, id: string): Promise<ActionResult<void>> => {
  const invitation = await prisma.staffInvitation.findUnique({
    where: { id },
  })

  if (!invitation) {
    return createFailure('招待が見つかりません')
  }

  if (invitation.usedAt) {
    return createFailure('使用済みの招待は再送できません')
  }

  // 新しいトークンと有効期限を設定
  const newToken = generateToken()
  const newExpiresAt = getExpiryDate()

  await prisma.staffInvitation.update({
    where: { id },
    data: {
      token: newToken,
      expiresAt: newExpiresAt,
    },
  })

  // メール再送
  const setupUrl = `${getAppUrl()}/admin/setup/${newToken}`

  const emailResult = await sendStaffInvitationEmail({
    to: invitation.email,
    staffName: invitation.name ?? invitation.email,
    setupUrl,
    expiresAt: newExpiresAt,
  })

  if (!emailResult.success) {
    logError(new Error(emailResult.error || 'Failed to resend invitation email'), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'resendInvitation', invitationId: id, email: invitation.email },
    })
    return createFailure('招待メールの再送に失敗しました')
  }

  revalidateTag(CACHE_TAGS.STAFF, 'default')
  return createSuccess('招待を再送しました')
})
