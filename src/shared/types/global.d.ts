/**
 * グローバル型定義
 *
 * シングルトンパターンで使用するグローバル変数の型を定義。
 * これにより `as unknown as` 型アサーションが不要になります。
 *
 * NOTE: auth は型推論のために auth.ts 内で declare global を使用
 */

import type { PrismaClient } from '@/shared/db/prisma'

/** gtag() の第1引数コマンド型 */
type GtagCommand = 'config' | 'event' | 'get' | 'set' | 'consent' | 'js'

/** gtag() のパラメータ型 */
type GtagParams = Record<string, string | number | boolean | null | undefined>

declare global {
  // Prisma シングルトン
  var prisma: PrismaClient | undefined

  // Google Analytics gtag（@next/third-parties が注入）
  var gtag: ((command: GtagCommand, target: string, params?: GtagParams) => void) | undefined
}

export {}
