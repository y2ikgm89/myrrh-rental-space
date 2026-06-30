/**
 * サーバー専用環境変数バリデーション
 *
 * @t3-oss/env-nextjs によるビルド時検証
 * シークレット類はここで定義
 *
 * ## 環境変数の必須/任意ルール
 * - DATABASE_URL, BETTER_AUTH_SECRET: 常に必須
 * - APP_SURFACE, ADMIN_APP_URL: 本番環境では必須
 * - ENCRYPTION_KEY, CRON_SECRET: 本番環境では必須
 * - その他: 任意（機能が無効化される）
 *
 * ## ビルド時の注意
 * `next build` は `NODE_ENV=production` のため、`isProduction()` が真になりうる。
 * 本番必須シークレット（ENCRYPTION_KEY 等）の検証はモジュール読み込みでは行わず、
 * `src/instrumentation.ts` の `register()` で Node サーバー起動時に一度だけ実行する。
 */

import "server-only";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const noTrailingSlashUrl = z.url().refine((v) => !v.endsWith("/"), {
  message: "must not end with trailing slash (paths are concatenated)",
});

/**
 * 本番環境かどうかを判定
 *
 * ビルド時は NODE_ENV=production になるため、
 * ビルドで厳密検証を無効化する場合は SKIP_ENV_VALIDATION=true を指定する。
 *
 * 本番環境判定:
 * - NODE_ENV=production
 * - SKIP_ENV_VALIDATION が未設定
 */
export const isProduction = (): boolean => {
  return (
    process.env["NODE_ENV"] === "production" &&
    !process.env["SKIP_ENV_VALIDATION"]
  );
};

export const serverEnv = createEnv({
  server: {
    // Database（必須）
    DATABASE_URL: z.url(),

    // Better Auth（必須）
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url().optional(),

    // Email (Resend)
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    EMAIL_FROM_NAME: z.string().optional(),
    /**
     * Resend Webhook 署名検証用シークレット（svix 形式 `whsec_...`）。
     * Resend Dashboard → Webhooks → Signing Secret から取得。
     * 設定されていない場合 `/api/webhooks/resend` は 503 を返す。
     * @see https://resend.com/docs/webhooks/verify-webhooks-requests
     */
    RESEND_WEBHOOK_SECRET: z.string().optional(),

    // Stripe
    STRIPE_SECRET_KEY: z.string().optional(),

    // Google Business Profile
    GBP_STUB_MODE: z.string().optional(),

    // Google OAuth / Google Calendar OAuth
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // LINE OAuth
    LINE_CLIENT_ID: z.string().optional(),
    LINE_CLIENT_SECRET: z.string().optional(),

    // Instagram API
    INSTAGRAM_APP_ID: z.string().optional(),
    INSTAGRAM_APP_SECRET: z.string().optional(),
    INSTAGRAM_REDIRECT_URI: z.url().optional(),

    // Turnstile
    TURNSTILE_SECRET_KEY: z.string().optional(),

    // Encryption（本番必須 - ランタイム検証）
    // API キー / OAuth トークン等の暗号化に使用。
    // 鍵ローテーション: `ENCRYPTION_KEY` は常に「新規 encrypt に使う primary key」、
    // `ENCRYPTION_KEY_ID` はそれの kid（識別子、デフォルト "v1"）、
    // `ENCRYPTION_KEYS_LEGACY` は decrypt fallback 用の旧鍵リスト
    // (`<kid>:<hex64>,<kid>:<hex64>,...` 形式)。
    ENCRYPTION_KEY: z
      .string()
      .length(64, { error: "ENCRYPTION_KEY must be exactly 64 characters" })
      .optional(),
    /** Primary key の識別子（kid）。1〜32 文字、`a-zA-Z0-9-_` のみ。未指定なら "v1"。 */
    ENCRYPTION_KEY_ID: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,32}$/u, {
        error:
          "ENCRYPTION_KEY_ID must be 1-32 chars of [a-zA-Z0-9_-] (e.g. 'v1', 'v2', 'k20260623')",
      })
      .optional(),
    /**
     * decrypt fallback 用の旧鍵リスト（ローテーション猶予期間用）。
     * 形式: `<kid1>:<hex64>,<kid2>:<hex64>,...`
     * 旧 ciphertext は kid に従って該当鍵で復号、鍵不在なら decrypt 失敗。
     */
    ENCRYPTION_KEYS_LEGACY: z
      .string()
      .regex(
        /^([a-zA-Z0-9_-]{1,32}:[0-9a-fA-F]{64})(,[a-zA-Z0-9_-]{1,32}:[0-9a-fA-F]{64})*$/u,
        {
          error:
            "ENCRYPTION_KEYS_LEGACY must be '<kid>:<hex64>' entries joined by ','",
        },
      )
      .optional(),

    // Cron（本番必須 - ランタイム検証）
    // Cron エンドポイントの認証に使用
    CRON_SECRET: z
      .string()
      .min(32, { error: "CRON_SECRET must be at least 32 characters" })
      .optional(),

    // Database connection pool tuning
    DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),

    // Deployment surface
    APP_SURFACE: z.enum(["public", "admin"]).default("admin"),
    ADMIN_APP_URL: noTrailingSlashUrl.optional(),

    // Google Analytics（サービスアカウント JSON — GA4 Data API）
    GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string().optional(),

    // Cloudflare R2（本番必須 - ランタイム検証）
    // 画像ストレージ（S3 互換 API）
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_PUBLIC_URL: z.url().optional(),

    // Cloudflare CDN（CDN cache purge / 任意）
    // 設定時のみ admin mutation 時に purge_by_tags が発火する。
    // Zone ID は 32 文字の hex（Cloudflare 公式形式）。
    // API Token は最小権限 `Zone:Read` + `Zone:Cache Purge:Purge` を単一 Zone に限定して発行する。
    CLOUDFLARE_ZONE_ID: z
      .string()
      .regex(/^[a-f0-9]{32}$/i, {
        error: "CLOUDFLARE_ZONE_ID must be exactly 32 hex characters",
      })
      .optional(),
    CLOUDFLARE_API_TOKEN: z.string().min(40).optional(),
    CLOUDFLARE_ORIGIN_HEADER_SECRET: z.string().min(32).optional(),

    // Node environment
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  runtimeEnv: {
    DATABASE_URL: process.env["DATABASE_URL"],
    BETTER_AUTH_SECRET: process.env["BETTER_AUTH_SECRET"],
    BETTER_AUTH_URL: process.env["BETTER_AUTH_URL"],
    RESEND_API_KEY: process.env["RESEND_API_KEY"],
    EMAIL_FROM: process.env["EMAIL_FROM"],
    EMAIL_FROM_NAME: process.env["EMAIL_FROM_NAME"],
    RESEND_WEBHOOK_SECRET: process.env["RESEND_WEBHOOK_SECRET"],
    STRIPE_SECRET_KEY: process.env["STRIPE_SECRET_KEY"],
    GBP_STUB_MODE: process.env["GBP_STUB_MODE"],
    GOOGLE_CLIENT_ID: process.env["GOOGLE_CLIENT_ID"],
    GOOGLE_CLIENT_SECRET: process.env["GOOGLE_CLIENT_SECRET"],
    LINE_CLIENT_ID: process.env["LINE_CLIENT_ID"],
    LINE_CLIENT_SECRET: process.env["LINE_CLIENT_SECRET"],
    INSTAGRAM_APP_ID: process.env["INSTAGRAM_APP_ID"],
    INSTAGRAM_APP_SECRET: process.env["INSTAGRAM_APP_SECRET"],
    INSTAGRAM_REDIRECT_URI: process.env["INSTAGRAM_REDIRECT_URI"],
    TURNSTILE_SECRET_KEY: process.env["TURNSTILE_SECRET_KEY"],
    ENCRYPTION_KEY: process.env["ENCRYPTION_KEY"],
    ENCRYPTION_KEY_ID: process.env["ENCRYPTION_KEY_ID"],
    ENCRYPTION_KEYS_LEGACY: process.env["ENCRYPTION_KEYS_LEGACY"],
    CRON_SECRET: process.env["CRON_SECRET"],
    DATABASE_POOL_MAX: process.env["DATABASE_POOL_MAX"],
    APP_SURFACE: process.env["APP_SURFACE"],
    ADMIN_APP_URL: process.env["ADMIN_APP_URL"],
    GOOGLE_APPLICATION_CREDENTIALS_JSON:
      process.env["GOOGLE_APPLICATION_CREDENTIALS_JSON"],
    R2_ACCOUNT_ID: process.env["R2_ACCOUNT_ID"],
    R2_ACCESS_KEY_ID: process.env["R2_ACCESS_KEY_ID"],
    R2_SECRET_ACCESS_KEY: process.env["R2_SECRET_ACCESS_KEY"],
    R2_BUCKET_NAME: process.env["R2_BUCKET_NAME"],
    R2_PUBLIC_URL: process.env["R2_PUBLIC_URL"],
    CLOUDFLARE_ZONE_ID: process.env["CLOUDFLARE_ZONE_ID"],
    CLOUDFLARE_API_TOKEN: process.env["CLOUDFLARE_API_TOKEN"],
    CLOUDFLARE_ORIGIN_HEADER_SECRET:
      process.env["CLOUDFLARE_ORIGIN_HEADER_SECRET"],
    NODE_ENV: process.env["NODE_ENV"],
  },
  // ビルド時検証をスキップするオプション（CI環境用）
  skipValidation: !!process.env["SKIP_ENV_VALIDATION"],
  // 空文字列をundefinedとして扱う
  emptyStringAsUndefined: true,
});

// =============================================================================
// 本番環境必須チェック（アプリ起動時に実行）
// =============================================================================

/**
 * 本番環境で必須の環境変数を検証する。
 * `next build` では未設定でもよい（ビルド時に `NODE_ENV=production` となるため、
 * ここを import 時に走らせるとローカルビルドが失敗する）。
 * Node サーバー起動時に `instrumentation.ts` から呼び出す。
 */
export function validateProductionEnv(): void {
  if (!isProduction()) return;

  const requiredInProd = [
    { name: "APP_SURFACE", value: process.env["APP_SURFACE"] },
    { name: "ADMIN_APP_URL", value: serverEnv.ADMIN_APP_URL },
    { name: "ENCRYPTION_KEY", value: serverEnv.ENCRYPTION_KEY },
    { name: "CRON_SECRET", value: serverEnv.CRON_SECRET },
    // Cloudflare R2 — 画像ストレージ必須
    { name: "R2_ACCOUNT_ID", value: serverEnv.R2_ACCOUNT_ID },
    { name: "R2_ACCESS_KEY_ID", value: serverEnv.R2_ACCESS_KEY_ID },
    { name: "R2_SECRET_ACCESS_KEY", value: serverEnv.R2_SECRET_ACCESS_KEY },
    { name: "R2_BUCKET_NAME", value: serverEnv.R2_BUCKET_NAME },
    { name: "R2_PUBLIC_URL", value: serverEnv.R2_PUBLIC_URL },
    // NEXT_PUBLIC_* はビルド時に client JS へインライン化されるが、
    // Cloud Build substitution で未指定だと "" でビルドされ silent failure になる。
    // instrumentation.register() で起動時に fail-fast させる。
    {
      name: "NEXT_PUBLIC_BASE_URL",
      value: process.env["NEXT_PUBLIC_BASE_URL"],
    },
    { name: "NEXT_PUBLIC_APP_URL", value: process.env["NEXT_PUBLIC_APP_URL"] },
    // Google OAuth は env / Secret Manager を正本とする
  ];

  const missing = requiredInProd
    .filter(({ value }) => !value)
    .map(({ name }) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(", ")}`,
    );
  }

  // ENCRYPTION_KEY の形式検証（64文字のhex = 32バイト）
  const encryptionKey = serverEnv.ENCRYPTION_KEY;
  if (encryptionKey) {
    if (encryptionKey.length !== 64) {
      throw new Error(
        `ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Current length: ${encryptionKey.length}. Generate with: openssl rand -hex 32`,
      );
    }
    if (!/^[0-9a-fA-F]+$/.test(encryptionKey)) {
      throw new Error(
        "ENCRYPTION_KEY must contain only hexadecimal characters (0-9, a-f, A-F). Generate with: openssl rand -hex 32",
      );
    }
  }
}
