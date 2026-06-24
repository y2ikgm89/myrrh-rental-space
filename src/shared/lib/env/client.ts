/**
 * クライアント環境変数バリデーション
 *
 * @t3-oss/env-nextjs によるビルド時検証
 * NEXT_PUBLIC_* 変数はここで定義
 */

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Base URL は path concat (`${BASE_URL}${path}`) で 30+ 箇所に流入する SSoT 値。
 * 末尾スラッシュは `//spaces` のようなダブルスラッシュ URL を sitemap / robots /
 * OGP canonical / breadcrumb JSON-LD に焼き込み Google の canonical signal を分断する。
 * Zod refine で build 時 fail-fast。
 */
const noTrailingSlash = z.url().refine((v) => !v.endsWith("/"), {
  message: "must not end with trailing slash (paths are concatenated)",
});

export const clientEnv = createEnv({
  client: {
    // Base URLs
    NEXT_PUBLIC_BASE_URL: noTrailingSlash,
    NEXT_PUBLIC_APP_URL: noTrailingSlash,

    // Turnstile (optional)
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),

    // Google Analytics (optional)
    NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().optional(),

    // E2E test opt-in (CI only) — production build でも DevLoginButton を表示する。
    // staging / production には絶対伝播させない (login bypass risk)。
    NEXT_PUBLIC_ENABLE_E2E_LOGIN: z.string().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_BASE_URL: process.env["NEXT_PUBLIC_BASE_URL"],
    NEXT_PUBLIC_APP_URL: process.env["NEXT_PUBLIC_APP_URL"],
    NEXT_PUBLIC_TURNSTILE_SITE_KEY:
      process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"],
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"],
    NEXT_PUBLIC_ENABLE_E2E_LOGIN: process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"],
  },
  // ビルド時検証をスキップするオプション（CI環境用）
  skipValidation: !!process.env["SKIP_ENV_VALIDATION"],
  // 空文字列をundefinedとして扱う
  emptyStringAsUndefined: true,
});
