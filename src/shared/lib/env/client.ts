/**
 * クライアント環境変数バリデーション
 *
 * @t3-oss/env-nextjs によるビルド時検証
 * NEXT_PUBLIC_* 変数はここで定義
 */

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const clientEnv = createEnv({
  client: {
    // Base URLs
    NEXT_PUBLIC_BASE_URL: z.string().url(),
    NEXT_PUBLIC_APP_URL: z.string().url(),

    // Supabase（ストレージ機能が有効な場合のみ必須）
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),

    // Turnstile (optional)
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),

    // Google Analytics (optional)
    NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_BASE_URL: process.env["NEXT_PUBLIC_BASE_URL"],
    NEXT_PUBLIC_APP_URL: process.env["NEXT_PUBLIC_APP_URL"],
    NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    NEXT_PUBLIC_TURNSTILE_SITE_KEY:
      process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"],
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"],
  },
  // ビルド時検証をスキップするオプション（CI環境用）
  skipValidation: !!process.env["SKIP_ENV_VALIDATION"],
  // 空文字列をundefinedとして扱う
  emptyStringAsUndefined: true,
});
