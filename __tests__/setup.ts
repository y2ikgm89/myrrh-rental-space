/**
 * テストグローバルセットアップ
 *
 * - 環境変数の設定
 * - グローバルモックの登録
 */

import { mock } from "bun:test";

// server-only をテスト環境でno-opにする
// （server-only/index.js は throw するため、react-server 条件なしの Bun テストではモックが必要）
mock.module("server-only", () => ({}));

// 環境変数設定
process.env["NODE_ENV"] = "test";
process.env["SKIP_ENV_VALIDATION"] = "true"; // @t3-oss/env バリデーションをスキップ
process.env["BETTER_AUTH_URL"] = "http://localhost:3000";
process.env["BETTER_AUTH_SECRET"] = "test-secret-key-for-testing-only";
process.env["DATABASE_URL"] = "postgresql://test:test@localhost:5432/test";
// crypto.ts の getMasterKey() が process.env を直接参照するため、
// @t3-oss/env-nextjs のスナップショット問題を回避する目的でプリロード時に設定
process.env["ENCRYPTION_KEY"] = "a".repeat(64); // テスト用 64文字16進数キー

// クライアント環境変数（テスト用ダミー値）
process.env["NEXT_PUBLIC_BASE_URL"] = "http://localhost:3000";
process.env["NEXT_PUBLIC_APP_URL"] = "http://localhost:3000";
process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://test.supabase.co";
process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = "test-anon-key";

// グローバル型定義
// NODE_ENV を 'test' リテラルに narrowing しない（src/ の比較式が TS2367 になるため）
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: string;
    }
  }
}

export {};
