/**
 * Auth.js (NextAuth) 型定義の拡張
 *
 * セッションとJWTにカスタムフィールドを追加
 */

import type { Role } from '@/generated/prisma/client'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: Role
    } & DefaultSession['user']
  }

  interface User {
    role: Role
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: Role
  }
}
