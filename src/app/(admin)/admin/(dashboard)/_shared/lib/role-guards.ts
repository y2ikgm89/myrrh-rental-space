/**
 * Role Type Guards
 *
 * クライアント/サーバー両方で使用可能な型ガード関数
 * permissions.ts はサーバー専用のため、Client Componentからはこちらを使用
 */

import { Role } from '@/shared/generated/prisma/enums'

/**
 * EDITORロールかどうかを判定
 */
export function isEditorRole(role: Role): role is typeof Role.EDITOR {
  return role === Role.EDITOR
}

/**
 * ADMINロールかどうかを判定
 */
export function isAdminRole(role: Role): role is typeof Role.ADMIN {
  return role === Role.ADMIN
}

/**
 * SUPER_ADMINロールかどうかを判定
 */
export function isSuperAdminRole(role: Role): role is typeof Role.SUPER_ADMIN {
  return role === Role.SUPER_ADMIN
}

// Re-export Role for convenience
export { Role }
