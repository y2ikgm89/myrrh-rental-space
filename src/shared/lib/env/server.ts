/**
 * サーバー専用環境変数バリデーション
 *
 * @t3-oss/env-nextjs によるビルド時検証
 * シークレット類はここで定義
 *
 * ## 環境変数の必須/任意ルール
 * - DATABASE_URL, BETTER_AUTH_SECRET: 常に必須
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

    // Cloudflare origin lock（任意 - オプトイン）
    // 設定すると、Cloudflare が Transform Rule で注入する `x-origin-verify`
    // シークレットヘッダーが一致するリクエストの cf-connecting-ip のみを信頼し、
    // *.run.app への直アクセス（Cloudflare バイパス）によるレート制限 IP 偽装を防ぐ。
    // 有効化手順:
    //   1. openssl rand -hex 32 等で生成し Secret Manager に登録
    //   2. cloudbuild.yaml の --update-secrets / availableSecrets に追加
    //   3. Cloudflare Transform Rule で全 origin リクエストに
    //      `x-origin-verify: <secret>` を「Set」（上書き）で注入
    CLOUDFLARE_ORIGIN_SECRET: z
      .string()
      .min(32, {
        error: "CLOUDFLARE_ORIGIN_SECRET must be at least 32 characters",
      })
      .optional(),

    // Encryption（本番必須 - ランタイム検証）
    // API キーの暗号化に使用
    ENCRYPTION_KEY: z
      .string()
      .length(64, { error: "ENCRYPTION_KEY must be exactly 64 characters" })
      .optional(),

    // Cron（本番必須 - ランタイム検証）
    // Cron エンドポイントの認証に使用
    CRON_SECRET: z
      .string()
      .min(32, { error: "CRON_SECRET must be at least 32 characters" })
      .optional(),

    // Admin Login（本番必須 - ランタイム検証）
    // 管理画面ログインページへのアクセス制限
    ADMIN_LOGIN_TOKEN: z
      .string()
      .min(32, { error: "ADMIN_LOGIN_TOKEN must be at least 32 characters" })
      .optional(),

    // Database connection pool tuning
    DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),

    // Google Analytics（サービスアカウント JSON — GA4 Data API）
    GOOGLE_APPLICATION_CREDENTIALS_JSON: z.string().optional(),

    // Cloudflare R2（本番必須 - ランタイム検証）
    // 画像ストレージ（S3 互換 API）
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_PUBLIC_URL: z.url().optional(),

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
    CLOUDFLARE_ORIGIN_SECRET: process.env["CLOUDFLARE_ORIGIN_SECRET"],
    ENCRYPTION_KEY: process.env["ENCRYPTION_KEY"],
    CRON_SECRET: process.env["CRON_SECRET"],
    ADMIN_LOGIN_TOKEN: process.env["ADMIN_LOGIN_TOKEN"],
    DATABASE_POOL_MAX: process.env["DATABASE_POOL_MAX"],
    GOOGLE_APPLICATION_CREDENTIALS_JSON:
      process.env["GOOGLE_APPLICATION_CREDENTIALS_JSON"],
    R2_ACCOUNT_ID: process.env["R2_ACCOUNT_ID"],
    R2_ACCESS_KEY_ID: process.env["R2_ACCESS_KEY_ID"],
    R2_SECRET_ACCESS_KEY: process.env["R2_SECRET_ACCESS_KEY"],
    R2_BUCKET_NAME: process.env["R2_BUCKET_NAME"],
    R2_PUBLIC_URL: process.env["R2_PUBLIC_URL"],
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
    { name: "ENCRYPTION_KEY", value: serverEnv.ENCRYPTION_KEY },
    { name: "CRON_SECRET", value: serverEnv.CRON_SECRET },
    { name: "ADMIN_LOGIN_TOKEN", value: serverEnv.ADMIN_LOGIN_TOKEN },
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
