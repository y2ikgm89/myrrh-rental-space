/**
 * 権限管理ライブラリ
 *
 * コード定義RBAC（Role-Based Access Control）
 * - ロール別の権限定義
 * - 権限チェック関数
 * - EDITOR用のページ割り当てアクセス制御
 */

import "server-only";

import { Role } from "@/shared/lib/validations/enums/prisma-types";
import {
  getAdminSession,
  getAdminSessionUser,
  type AdminUser,
} from "@/shared/lib/admin-auth";
import { isDashboardRole } from "@/shared/lib/admin-roles";
import { getAssignedPageIdsForUser } from "@/shared/domain/user-page-assignments/queries";
import { logPermissionDenied } from "@/admin/lib/audit";
import { isEditorRole } from "./role-guards";

// =============================================================================
// Types
// =============================================================================

/** リソース種別 */
export type Resource =
  | "space"
  | "location"
  | "spaceCategory"
  | "reservation"
  | "customer"
  | "inquiry"
  | "post"
  | "news"
  | "page"
  | "faq"
  | "terms"
  | "settings"
  | "user"
  | "auditLog"
  | "navigation"
  | "announcementBar"
  | "media"
  | "coupon"
  | "blockTemplate"
  | "review"
  | "event"
  | "notification";

/** アクション種別 */
export type Action =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "publish"
  | "manage";

/** 権限キー（resource:action） */
export type PermissionKey = `${Resource}:${Action}`;

/** ロール別権限定義 */
export type RolePermissions = Record<Role, PermissionKey[]>;

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
    "space:create",
    "space:read",
    "space:update",
    "space:delete",
    "space:publish",
    "location:create",
    "location:read",
    "location:update",
    "location:delete",
    "location:publish",
    "spaceCategory:create",
    "spaceCategory:read",
    "spaceCategory:update",
    "spaceCategory:delete",
    "spaceCategory:manage",
    "reservation:create",
    "reservation:read",
    "reservation:update",
    "reservation:delete",
    "reservation:manage",
    "customer:create",
    "customer:read",
    "customer:update",
    "customer:delete",
    "customer:manage",
    "inquiry:read",
    "inquiry:update",
    "inquiry:delete",
    "inquiry:manage",
    "post:create",
    "post:read",
    "post:update",
    "post:delete",
    "post:publish",
    "news:create",
    "news:read",
    "news:update",
    "news:delete",
    "news:publish",
    "page:create",
    "page:read",
    "page:update",
    "page:delete",
    "page:publish",
    "faq:create",
    "faq:read",
    "faq:update",
    "faq:delete",
    "faq:manage",
    "terms:create",
    "terms:read",
    "terms:update",
    "terms:delete",
    "terms:publish",
    "settings:read",
    "settings:update",
    "settings:manage",
    "user:create",
    "user:read",
    "user:update",
    "user:delete",
    "user:manage",
    "auditLog:read",
    "auditLog:manage",
    "navigation:create",
    "navigation:read",
    "navigation:update",
    "navigation:delete",
    "navigation:manage",
    "announcementBar:create",
    "announcementBar:read",
    "announcementBar:update",
    "announcementBar:delete",
    "announcementBar:manage",
    "media:create",
    "media:read",
    "media:update",
    "media:delete",
    "media:manage",
    "coupon:create",
    "coupon:read",
    "coupon:update",
    "coupon:delete",
    "coupon:manage",
    "blockTemplate:create",
    "blockTemplate:read",
    "blockTemplate:delete",
    "blockTemplate:manage",
    "review:read",
    "review:update",
    "review:delete",
    "event:create",
    "event:read",
    "event:update",
    "event:delete",
    "event:publish",
    "notification:read",
    "notification:update",
    "notification:delete",
  ],
  ADMIN: [
    // コンテンツ管理（ユーザー管理・監査ログ除く）
    "space:create",
    "space:read",
    "space:update",
    "space:delete",
    "space:publish",
    "location:create",
    "location:read",
    "location:update",
    "location:delete",
    "location:publish",
    "spaceCategory:create",
    "spaceCategory:read",
    "spaceCategory:update",
    "spaceCategory:delete",
    "spaceCategory:manage",
    "reservation:create",
    "reservation:read",
    "reservation:update",
    "reservation:delete",
    "reservation:manage",
    "customer:create",
    "customer:read",
    "customer:update",
    "customer:delete",
    "customer:manage",
    "inquiry:read",
    "inquiry:update",
    "inquiry:delete",
    "inquiry:manage",
    "post:create",
    "post:read",
    "post:update",
    "post:delete",
    "post:publish",
    "news:create",
    "news:read",
    "news:update",
    "news:delete",
    "news:publish",
    "page:create",
    "page:read",
    "page:update",
    "page:delete",
    "page:publish",
    "faq:create",
    "faq:read",
    "faq:update",
    "faq:delete",
    "faq:manage",
    "terms:create",
    "terms:read",
    "terms:update",
    "terms:delete",
    "terms:publish",
    "settings:read",
    "settings:update",
    "user:read", // 閲覧のみ
    "navigation:create",
    "navigation:read",
    "navigation:update",
    "navigation:delete",
    "navigation:manage",
    "announcementBar:create",
    "announcementBar:read",
    "announcementBar:update",
    "announcementBar:delete",
    "announcementBar:manage",
    "media:create",
    "media:read",
    "media:update",
    "media:delete",
    "media:manage",
    "coupon:create",
    "coupon:read",
    "coupon:update",
    "coupon:delete",
    "coupon:manage",
    "blockTemplate:create",
    "blockTemplate:read",
    "blockTemplate:delete",
    "blockTemplate:manage",
    "review:read",
    "review:update",
    "review:delete",
    "event:create",
    "event:read",
    "event:update",
    "event:delete",
    "event:publish",
    "notification:read",
    "notification:update",
    "notification:delete",
  ],
  EDITOR: [
    // 割り当てページ編集のみ（要リソースIDチェック）
    "post:read",
    "post:update",
    "news:read",
    "news:update",
    "page:read",
    "page:update",
    "faq:read",
    "faq:update",
    "media:create",
    "media:read",
    "media:update", // アップロード・閲覧・編集のみ
    "blockTemplate:create",
    "blockTemplate:read",
    "blockTemplate:delete", // テンプレート管理
    "event:read",
    "event:update",
    "notification:read",
    "notification:update",
  ],
  VIEWER: [
    // 閲覧のみ
    "space:read",
    "location:read",
    "spaceCategory:read",
    "reservation:read",
    "customer:read",
    "inquiry:read",
    "post:read",
    "news:read",
    "page:read",
    "faq:read",
    "terms:read",
    "settings:read",
    "navigation:read",
    "announcementBar:read",
    "media:read",
    "review:read",
    "event:read",
    "notification:read",
  ],
  USER: [],
  CUSTOMER: [],
};

/**
 * リソース説明（UI表示用）
 */
export const RESOURCE_LABELS: Record<Resource, string> = {
  space: "スペース",
  location: "場所",
  spaceCategory: "スペースカテゴリー",
  reservation: "予約",
  customer: "顧客",
  inquiry: "お問い合わせ",
  post: "投稿",
  news: "お知らせ",
  page: "固定ページ",
  faq: "FAQ",
  terms: "利用規約",
  settings: "設定",
  user: "ユーザー",
  auditLog: "監査ログ",
  navigation: "ナビゲーション",
  announcementBar: "お知らせバー",
  media: "メディア",
  coupon: "クーポン",
  blockTemplate: "ブロックテンプレート",
  review: "レビュー",
  event: "イベント",
  notification: "通知",
};

/**
 * アクション説明（UI表示用）
 */
export const ACTION_LABELS: Record<Action, string> = {
  create: "作成",
  read: "閲覧",
  update: "編集",
  delete: "削除",
  publish: "公開",
  manage: "管理",
};

/**
 * ロール日本語ラベル（UI 表示用）
 *
 * Single Source of Truth は `@/shared/lib/admin-roles`。
 * 既存 import パス（`@/admin/lib/permissions`）を維持するための再 export。
 */
export { ROLE_LABELS } from "@/shared/lib/admin-roles";

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
  action: Action,
): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  const key: PermissionKey = `${resource}:${action}`;
  return permissions.includes(key);
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
  user: AdminUser,
  resource: Resource,
  action: Action,
): boolean {
  return hasPermission(user.role, resource, action);
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
  user: AdminUser,
  resource: Resource,
  action: Action,
  resourceId?: string,
): Promise<boolean> {
  // まず基本権限をチェック
  if (!userHasPermission(user, resource, action)) {
    return false;
  }

  // EDITOR以外は全リソースにアクセス可能
  if (!isEditorRole(user.role)) {
    return true;
  }

  // EDITORはpageAssignmentsに含まれるリソースのみアクセス可能
  // ただし、resourceIdなしの場合（一覧表示など）は許可
  // 一覧表示時はフィルタリングで対応
  if (!resourceId) {
    return true;
  }

  // DBからページ割り当てを取得
  const assignedPageIds = await getAssignedPageIdsForUser(user.id);
  return assignedPageIds.includes(resourceId);
}

/**
 * 管理画面アクセス可能かチェック
 *
 * @param role ユーザーのロール
 * @returns 管理画面アクセス可能ならtrue
 */
export function canAccessAdmin(role: Role): boolean {
  return isDashboardRole(role);
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
export function checkReadPermissionFor(
  resource: Resource,
): () => Promise<boolean> {
  return async (): Promise<boolean> => {
    const session = await getAdminSession();
    if (!session?.user) return false;
    const user = getAdminSessionUser(session);
    if (!user) return false;
    if (!canAccessAdmin(user.role)) return false;
    if (!hasPermission(user.role, resource, "read")) {
      void logPermissionDenied(user.id, resource, "read");
      return false;
    }
    return true;
  };
}

// =============================================================================
// Role Type Guards (re-exported from role-guards.ts for client compatibility)
// =============================================================================

export { isEditorRole, isAdminRole, isSuperAdminRole } from "./role-guards";
