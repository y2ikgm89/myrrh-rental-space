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

  // Google Analytics gtag（@next/third-parties が注入）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var gtag: ((...args: any[]) => void) | undefined
}

export {}
