/**
 * テストグローバルセットアップ
 *
 * - 環境変数の設定
 * - グローバルモックの登録
 */

// 環境変数設定
process.env.NODE_ENV = 'test'
process.env.BETTER_AUTH_URL = 'http://localhost:3000'
process.env.BETTER_AUTH_SECRET = 'test-secret-key-for-testing-only'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

// グローバル型定義
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'test'
    }
  }
}

export {}
