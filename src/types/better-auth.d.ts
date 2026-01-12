/**
 * Better Auth 型定義の拡張
 *
 * @see https://www.better-auth.com/docs
 *
 * Better Auth は $Infer から型を推論するため、
 * このファイルでは追加のユーザーフィールドのみ定義
 */

import type { Role } from '@/generated/prisma/client/client'

declare module 'better-auth' {
  interface User {
    role: Role
  }
}
