/**
 * 権限管理ライブラリ
 *
 * DBベースのRBAC（Role-Based Access Control）
 * - ロール別の権限定義
 * - 権限チェック関数（cache()でメモ化）
 * - EDITOR用のリソース単位アクセス制御
 */

import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'
import { prisma, Role } from '@/shared/lib/prisma'
import { getSession, getRoleFromSession, type User } from '@/shared/lib/auth'
import { logPermissionDenied } from '@/admin/lib/audit'
import { entriesOf } from '@/shared/lib/serialize'
import { logError, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
import { isEditorRole } from './role-guards'

// =============================================================================
// Types
// =============================================================================

/** リソース種別 */
export type Resource =
  | 'space'
  | 'location'
  | 'spaceCategory'
  | 'reservation'
  | 'customer'
  | 'inquiry'
  | 'post'
  | 'news'
  | 'page'
  | 'faq'
  | 'terms'
  | 'settings'
  | 'user'
  | 'auditLog'
  | 'navigation'
  | 'announcementBar'
  | 'media'
  | 'coupon'
  | 'blockTemplate'

/** アクション種別 */
export type Action = 'create' | 'read' | 'update' | 'delete' | 'publish' | 'manage'

/** 権限キー（resource:action） */
export type PermissionKey = `${Resource}:${Action}`

/** ロール別権限定義 */
export type RolePermissions = Record<Role, PermissionKey[]>

// =============================================================================
// 権限定義（コードベース、UIから参照可能）
// =============================================================================

/**
 * ロール別の権限定義
 *
 * SUPER_ADMIN: 全権限
 * ADMIN: コンテンツ管理全般
 * EDITOR: 割り当てページ編集のみ
 * VIEWER: 閲覧のみ
 * USER: 公開ユーザー（管理機能なし）
 */
export const ROLE_PERMISSIONS: RolePermissions = {
  SUPER_ADMIN: [
    // 全リソース × 全アクション
    'space:create', 'space:read', 'space:update', 'space:delete', 'space:publish',
    'location:create', 'location:read', 'location:update', 'location:delete', 'location:publish',
    'spaceCategory:create', 'spaceCategory:read', 'spaceCategory:update', 'spaceCategory:delete', 'spaceCategory:manage',
    'reservation:create', 'reservation:read', 'reservation:update', 'reservation:delete', 'reservation:manage',
    'customer:create', 'customer:read', 'customer:update', 'customer:delete', 'customer:manage',
    'inquiry:read', 'inquiry:update', 'inquiry:delete', 'inquiry:manage',
    'post:create', 'post:read', 'post:update', 'post:delete', 'post:publish',
    'news:create', 'news:read', 'news:update', 'news:delete', 'news:publish',
    'page:create', 'page:read', 'page:update', 'page:delete', 'page:publish',
    'faq:create', 'faq:read', 'faq:update', 'faq:delete', 'faq:manage',
    'terms:create', 'terms:read', 'terms:update', 'terms:delete', 'terms:publish',
    'settings:read', 'settings:update', 'settings:manage',
    'user:create', 'user:read', 'user:update', 'user:delete', 'user:manage',
    'auditLog:read', 'auditLog:manage',
    'navigation:create', 'navigation:read', 'navigation:update', 'navigation:delete', 'navigation:manage',
    'announcementBar:create', 'announcementBar:read', 'announcementBar:update', 'announcementBar:delete', 'announcementBar:manage',
    'media:create', 'media:read', 'media:update', 'media:delete', 'media:manage',
    'coupon:create', 'coupon:read', 'coupon:update', 'coupon:delete', 'coupon:manage',
    'blockTemplate:create', 'blockTemplate:read', 'blockTemplate:delete', 'blockTemplate:manage',
  ],
  ADMIN: [
    // コンテンツ管理（ユーザー管理・監査ログ除く）
    'space:create', 'space:read', 'space:update', 'space:delete', 'space:publish',
    'location:create', 'location:read', 'location:update', 'location:delete', 'location:publish',
    'spaceCategory:create', 'spaceCategory:read', 'spaceCategory:update', 'spaceCategory:delete', 'spaceCategory:manage',
    'reservation:create', 'reservation:read', 'reservation:update', 'reservation:delete', 'reservation:manage',
    'customer:create', 'customer:read', 'customer:update', 'customer:delete', 'customer:manage',
    'inquiry:read', 'inquiry:update', 'inquiry:delete', 'inquiry:manage',
    'post:create', 'post:read', 'post:update', 'post:delete', 'post:publish',
    'news:create', 'news:read', 'news:update', 'news:delete', 'news:publish',
    'page:create', 'page:read', 'page:update', 'page:delete', 'page:publish',
    'faq:create', 'faq:read', 'faq:update', 'faq:delete', 'faq:manage',
    'terms:create', 'terms:read', 'terms:update', 'terms:delete', 'terms:publish',
    'settings:read', 'settings:update',
    'user:read', // 閲覧のみ
    'navigation:create', 'navigation:read', 'navigation:update', 'navigation:delete', 'navigation:manage',
    'announcementBar:create', 'announcementBar:read', 'announcementBar:update', 'announcementBar:delete', 'announcementBar:manage',
    'media:create', 'media:read', 'media:update', 'media:delete', 'media:manage',
    'coupon:create', 'coupon:read', 'coupon:update', 'coupon:delete', 'coupon:manage',
    'blockTemplate:create', 'blockTemplate:read', 'blockTemplate:delete', 'blockTemplate:manage',
  ],
  EDITOR: [
    // 割り当てページ編集のみ（要リソースIDチェック）
    'post:read', 'post:update',
    'news:read', 'news:update',
    'page:read', 'page:update',
    'faq:read', 'faq:update',
    'media:create', 'media:read', 'media:update', // アップロード・閲覧・編集のみ
    'blockTemplate:create', 'blockTemplate:read', 'blockTemplate:delete', // テンプレート管理
  ],
  VIEWER: [
    // 閲覧のみ
    'space:read',
    'location:read',
    'spaceCategory:read',
    'reservation:read',
    'customer:read',
    'inquiry:read',
    'post:read',
    'news:read',
    'page:read',
    'faq:read',
    'terms:read',
    'settings:read',
    'navigation:read',
    'announcementBar:read',
    'media:read',
  ],
  USER: [],
}

/**
 * 管理画面アクセス可能なロール
 */
export const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR, Role.VIEWER]

/**
 * リソース説明（UI表示用）
 */
export const RESOURCE_LABELS: Record<Resource, string> = {
  space: 'スペース',
  location: '場所',
  spaceCategory: 'スペースカテゴリー',
  reservation: '予約',
  customer: '顧客',
  inquiry: 'お問い合わせ',
  post: '投稿',
  news: 'お知らせ',
  page: '固定ページ',
  faq: 'FAQ',
  terms: '利用規約',
  settings: '設定',
  user: 'ユーザー',
  auditLog: '監査ログ',
  navigation: 'ナビゲーション',
  announcementBar: 'お知らせバー',
  media: 'メディア',
  coupon: 'クーポン',
  blockTemplate: 'ブロックテンプレート',
}

/**
 * アクション説明（UI表示用）
 */
export const ACTION_LABELS: Record<Action, string> = {
  create: '作成',
  read: '閲覧',
  update: '編集',
  delete: '削除',
  publish: '公開',
  manage: '管理',
}

/**
 * ロール説明（UI表示用）
 */
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'スーパー管理者',
  ADMIN: '管理者',
  EDITOR: '編集者',
  VIEWER: '閲覧者',
  USER: 'ユーザー',
}

// =============================================================================
// 権限チェック関数
// =============================================================================

/**
 * ロールが権限を持つかチェック（同期）
 *
 * @param role ユーザーのロール
 * @param resource リソース種別
 * @param action アクション種別
 * @returns 権限があればtrue
 */
export function hasPermission(
  role: Role,
  resource: Resource,
  action: Action
): boolean {
  const permissions = ROLE_PERMISSIONS[role]
  const key: PermissionKey = `${resource}:${action}`
  return permissions.includes(key)
}

/**
 * ユーザーが権限を持つかチェック（同期）
 *
 * @param user ユーザー
 * @param resource リソース種別
 * @param action アクション種別
 * @returns 権限があればtrue
 */
export function userHasPermission(
  user: User,
  resource: Resource,
  action: Action
): boolean {
  return hasPermission(user.role, resource, action)
}

/**
 * ユーザーが特定リソースIDへのアクセス権を持つかチェック
 *
 * EDITORロールの場合、assignedPagesに含まれるリソースのみアクセス可能
 *
 * @param user ユーザー
 * @param resource リソース種別
 * @param action アクション種別
 * @param resourceId リソースID
 * @returns 権限があればtrue
 */
export async function userHasResourceAccess(
  user: User,
  resource: Resource,
  action: Action,
  resourceId?: string
): Promise<boolean> {
  // まず基本権限をチェック
  if (!userHasPermission(user, resource, action)) {
    return false
  }

  // EDITOR以外は全リソースにアクセス可能
  if (!isEditorRole(user.role)) {
    return true
  }

  // EDITORはpageAssignmentsに含まれるリソースのみアクセス可能
  // ただし、resourceIdなしの場合（一覧表示など）は許可
  // 一覧表示時はフィルタリングで対応
  if (!resourceId) {
    return true
  }

  // DBからページ割り当てを取得
  const assignments = await prisma.userPageAssignment.findMany({
    where: { userId: user.id },
    select: { pageId: true },
  })
  const assignedPageIds = assignments.map((a) => a.pageId)
  return assignedPageIds.includes(resourceId)
}

/**
 * 管理画面アクセス可能かチェック
 *
 * @param role ユーザーのロール
 * @returns 管理画面アクセス可能ならtrue
 */
export function canAccessAdmin(role: Role): boolean {
  return ADMIN_ROLES.includes(role)
}

// =============================================================================
// 読み取り権限チェックヘルパー（Server Actions用）
// =============================================================================

/**
 * リソース別の読み取り権限チェック関数を生成
 *
 * @param resource リソース種別
 * @returns 読み取り権限チェック関数
 *
 * @example
 * // アクションファイル内での使用
 * const checkReadPermission = checkReadPermissionFor('space')
 *
 * export async function getSpaces() {
 *   if (!(await checkReadPermission())) {
 *     return { spaces: [], total: 0, page: 1, limit: 10, totalPages: 0 }
 *   }
 *   // ...
 * }
 */
export function checkReadPermissionFor(resource: Resource): () => Promise<boolean> {
  return async (): Promise<boolean> => {
    const session = await getSession()
    if (!session?.user) return false
    const role = getRoleFromSession(session)
    if (!role) return false
    if (!canAccessAdmin(role)) return false
    if (!hasPermission(role, resource, 'read')) {
      void logPermissionDenied(session.user.id, resource, 'read')
      return false
    }
    return true
  }
}

// =============================================================================
// Permission Key Parsing
// =============================================================================

/**
 * Resource型の型ガード（RESOURCE_LABELSから自動導出 — Single Source of Truth）
 */
const VALID_RESOURCES = new Set<string>(Object.keys(RESOURCE_LABELS))
function isValidResource(value: string): value is Resource {
  return VALID_RESOURCES.has(value)
}

/**
 * Action型の型ガード（ACTION_LABELSから自動導出 — Single Source of Truth）
 */
const VALID_ACTIONS = new Set<string>(Object.keys(ACTION_LABELS))
function isValidAction(value: string): value is Action {
  return VALID_ACTIONS.has(value)
}

/**
 * PermissionKeyをパースして型安全なresourceとactionを返す
 *
 * @param permKey - パースするPermissionKey（例: "page:read"）
 * @returns パース結果。無効な場合はnull
 */
function parsePermissionKey(permKey: PermissionKey): { resource: Resource; action: Action } | null {
  const parts = permKey.split(':')
  if (parts.length !== 2) return null

  const resource = parts[0]
  const action = parts[1]
  if (!resource || !action) return null
  if (!isValidResource(resource) || !isValidAction(action)) return null

  return { resource, action }
}

// =============================================================================
// DB同期関数（初期化・シード用）
// =============================================================================

/**
 * 権限定義をDBに同期
 *
 * ROLE_PERMISSIONSの内容をPermission/RolePermissionテーブルに反映
 * 既存データはそのまま、新規のみ追加
 */
export async function syncPermissionsToDb(): Promise<void> {
  // 全権限キーを収集
  const allPermissions = new Set<PermissionKey>()
  for (const permissions of Object.values(ROLE_PERMISSIONS)) {
    for (const perm of permissions) {
      allPermissions.add(perm)
    }
  }

  // Permission テーブルに upsert
  for (const permKey of allPermissions) {
    const parsed = parsePermissionKey(permKey)
    if (!parsed) {
      logError(new Error(`Invalid permission key: ${permKey}`), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: 'syncPermissionsToDb', permKey },
      })
      continue
    }

    const { resource, action } = parsed
    await prisma.permission.upsert({
      where: { resource_action: { resource, action } },
      create: {
        resource,
        action,
        description: `${RESOURCE_LABELS[resource]}の${ACTION_LABELS[action]}`,
      },
      update: {},
    })
  }

  // RolePermission テーブルに upsert
  const roleEntries = entriesOf(ROLE_PERMISSIONS)
  for (const [role, permissions] of roleEntries) {
    for (const permKey of permissions) {
      const parsed = parsePermissionKey(permKey)
      if (!parsed) {
        logError(new Error(`Invalid permission key: ${permKey}`), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: 'syncPermissionsToDb', permKey },
      })
        continue
      }

      const { resource, action } = parsed
      const permission = await prisma.permission.findUnique({
        where: { resource_action: { resource, action } },
      })
      if (permission) {
        await prisma.rolePermission.upsert({
          where: { role_permissionId: { role, permissionId: permission.id } },
          create: {
            role,
            permissionId: permission.id,
          },
          update: {},
        })
      }
    }
  }
}

// =============================================================================
// キャッシュ付き権限チェック（Server Components用）
// =============================================================================

/**
 * DBから権限をチェック（'use cache' でクロスリクエストキャッシュ）
 *
 * コードベース定義と併用する場合、DB優先
 * 権限更新時は updateTag(CACHE_TAGS.PERMISSIONS) で無効化
 */
export async function checkPermissionFromDb(
  role: Role, resource: Resource, action: Action
): Promise<boolean> {
  'use cache'
  cacheLife(CACHE_LIFE.STATIC_SETTINGS)
  cacheTag(CACHE_TAGS.PERMISSIONS)

  const permission = await prisma.permission.findUnique({
    where: { resource_action: { resource, action } },
    include: {
      rolePermissions: {
        where: { role },
      },
    },
  })
  return (permission?.rolePermissions.length ?? 0) > 0
}

/**
 * ユーザーの全権限を取得（'use cache' でクロスリクエストキャッシュ）
 *
 * 権限更新時は updateTag(CACHE_TAGS.PERMISSIONS) で無効化
 */
export async function getUserPermissions(role: Role): Promise<PermissionKey[]> {
  'use cache'
  cacheLife(CACHE_LIFE.STATIC_SETTINGS)
  cacheTag(CACHE_TAGS.PERMISSIONS)

  const rolePermissions = await prisma.rolePermission.findMany({
    where: { role },
    include: { permission: true },
  })
  return rolePermissions.flatMap((rp) => {
    const { resource, action } = rp.permission
    if (!isValidResource(resource) || !isValidAction(action)) return []
    const key: PermissionKey = `${resource}:${action}`
    return [key]
  })
}

// =============================================================================
// Role Type Guards (re-exported from role-guards.ts for client compatibility)
// =============================================================================

export { isEditorRole, isAdminRole, isSuperAdminRole } from './role-guards'
