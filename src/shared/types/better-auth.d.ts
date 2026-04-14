/**
 * Better Auth 型定義の拡張
 *
 * additionalFields の role は Better Auth 内部では string 型。
 * Module augmentation で Role enum に上書きし、型レベルの整合性を確保する。
 * ランタイムでの検証は auth.ts の isValidRole() が担う。
 *
 * @see https://www.better-auth.com/docs/concepts/users-accounts
 */

import type { Role } from "@/shared/lib/validations/enums/prisma-types";

declare module "better-auth" {
  interface User {
    role: Role;
  }
}
