/**
 * 権限管理 - 定数・型定義
 *
 * Client Component から安全にインポート可能
 * Prisma への依存なし
 */

import { Role } from '@/generated/prisma/client/enums'

// =============================================================================
// Types
// =============================================================================

/** リソース種別 */
export type Resource =
  | 'space'
  | 'reservation'
  | 'customer'
  | 'inquiry'
  | 'blog'
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

/** アクション種別 */
export type Action = 'create' | 'read' | 'update' | 'delete' | 'publish' | 'manage'

/** 権限キー（resource:action） */
export type PermissionKey = `${Resource}:${Action}`

/** ロール別権限定義 */
export type RolePermissions = Record<Role, PermissionKey[]>

// =============================================================================
// 権限定義
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
    'reservation:create', 'reservation:read', 'reservation:update', 'reservation:delete', 'reservation:manage',
    'customer:create', 'customer:read', 'customer:update', 'customer:delete', 'customer:manage',
    'inquiry:read', 'inquiry:update', 'inquiry:delete', 'inquiry:manage',
    'blog:create', 'blog:read', 'blog:update', 'blog:delete', 'blog:publish',
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
  ],
  ADMIN: [
    // コンテンツ管理（ユーザー管理・監査ログ除く）
    'space:create', 'space:read', 'space:update', 'space:delete', 'space:publish',
    'reservation:create', 'reservation:read', 'reservation:update', 'reservation:delete', 'reservation:manage',
    'customer:create', 'customer:read', 'customer:update', 'customer:delete', 'customer:manage',
    'inquiry:read', 'inquiry:update', 'inquiry:delete', 'inquiry:manage',
    'blog:create', 'blog:read', 'blog:update', 'blog:delete', 'blog:publish',
    'news:create', 'news:read', 'news:update', 'news:delete', 'news:publish',
    'page:create', 'page:read', 'page:update', 'page:delete', 'page:publish',
    'faq:create', 'faq:read', 'faq:update', 'faq:delete', 'faq:manage',
    'terms:create', 'terms:read', 'terms:update', 'terms:delete', 'terms:publish',
    'settings:read', 'settings:update',
    'user:read', // 閲覧のみ
    'navigation:create', 'navigation:read', 'navigation:update', 'navigation:delete', 'navigation:manage',
    'announcementBar:create', 'announcementBar:read', 'announcementBar:update', 'announcementBar:delete', 'announcementBar:manage',
    'media:create', 'media:read', 'media:update', 'media:delete', 'media:manage',
  ],
  EDITOR: [
    // 割り当てページ編集のみ（要リソースIDチェック）
    'blog:read', 'blog:update',
    'news:read', 'news:update',
    'page:read', 'page:update',
    'faq:read', 'faq:update',
    'media:create', 'media:read', 'media:update', // アップロード・閲覧・編集のみ
  ],
  VIEWER: [
    // 閲覧のみ
    'space:read',
    'reservation:read',
    'customer:read',
    'inquiry:read',
    'blog:read',
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
  reservation: '予約',
  customer: '顧客',
  inquiry: 'お問い合わせ',
  blog: 'ブログ',
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
// 権限チェック関数（同期、Prisma不要）
// =============================================================================

/**
 * ロールが権限を持つかチェック（同期）
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
 * 管理画面アクセス可能かチェック
 */
export function canAccessAdmin(role: Role): boolean {
  return ADMIN_ROLES.includes(role)
}
