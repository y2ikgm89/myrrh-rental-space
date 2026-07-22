/**
 * Role Type Guards（client-safe）
 *
 * クライアント/サーバー両方で使用可能な型ガード関数。`src/app/(public)/*` の
 * プレビュールート等、admin dashboard tree の外からも参照するため shared に置く。
 */

import { Role } from "@/shared/lib/validations/enums/prisma-types";

/**
 * EDITORロールかどうかを判定
 */
export function isEditorRole(role: Role): role is typeof Role.EDITOR {
  return role === Role.EDITOR;
}

/**
 * ADMINロールかどうかを判定
 */
export function isAdminRole(role: Role): role is typeof Role.ADMIN {
  return role === Role.ADMIN;
}

/**
 * SUPER_ADMINロールかどうかを判定
 */
export function isSuperAdminRole(role: Role): role is typeof Role.SUPER_ADMIN {
  return role === Role.SUPER_ADMIN;
}
