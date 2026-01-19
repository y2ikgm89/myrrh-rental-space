/**
 * 環境変数バリデーション - 統合エクスポート
 *
 * 使用方法:
 *   import { env } from '@/shared/lib/env'
 *   console.log(env.DATABASE_URL)
 *   console.log(env.NEXT_PUBLIC_BASE_URL)
 */

import { serverEnv } from './server'
import { clientEnv } from './client'

/**
 * 統合環境変数オブジェクト
 *
 * サーバー・クライアント環境変数を統合してエクスポート
 * サーバーサイドでのみサーバー変数にアクセス可能
 */
export const env = {
  ...serverEnv,
  ...clientEnv,
} as const

// 個別エクスポート（必要に応じて使い分け）
export { serverEnv, clientEnv }
