/**
 * テストグローバルセットアップ
 *
 * - 環境変数の設定
 * - グローバルモックの登録
 */

// 環境変数設定
process.env.NODE_ENV = 'test'
process.env.SKIP_ENV_VALIDATION = 'true' // @t3-oss/env バリデーションをスキップ
process.env.BETTER_AUTH_URL = 'http://localhost:3000'
process.env.BETTER_AUTH_SECRET = 'test-secret-key-for-testing-only'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

// クライアント環境変数（テスト用ダミー値）
process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

// グローバル型定義
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'test'
    }
  }
}

export {}
