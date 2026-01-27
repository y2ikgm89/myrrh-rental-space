/**
 * グローバル型定義
 *
 * シングルトンパターンで使用するグローバル変数の型を定義。
 * これにより `as unknown as` 型アサーションが不要になります。
 *
 * NOTE: auth は型推論のために auth.ts 内で declare global を使用
 */

import type { PrismaClient } from '@/shared/generated/prisma/client'

declare global {
  // Prisma シングルトン
  var prisma: PrismaClient | undefined
}

export {}
