/**
 * サーバー専用環境変数バリデーション
 *
 * @t3-oss/env-nextjs によるビルド時検証
 * シークレット類はここで定義
 *
 * ## 環境変数の必須/任意ルール
 * - DATABASE_URL, BETTER_AUTH_SECRET: 常に必須
 * - BETTER_AUTH_URL: 本番環境では必須
 * - APP_SURFACE, ADMIN_APP_URL: 本番環境では必須
 * - ENCRYPTION_KEY, AUDIT_LOG_HMAC_KEY, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: 本番環境では必須
 * - CRON_OIDC_AUDIENCE, CRON_SERVICE_ACCOUNT_EMAIL: 本番環境では必須
 * - その他: 任意（機能が無効化される）
 *
 * ## ビルド時の注意
 * `next build` は `NODE_ENV=production` のため、`isProduction()` が真になりうる。
 * 本番必須シークレット（ENCRYPTION_KEY 等）の検証はモジュール読み込みでは行わず、
 * `src/instrumentation.ts` の `register()` で Node サーバー起動時に一度だけ実行する。
 */

import "server-only";
import { Buffer } from "node:buffer";
import { createEnv } from "@t3-oss/env-nextjs";
import type { StandardSchemaV1 } from "@t3-oss/env-core";
import { z } from "zod";

const isBase64EncodedAesKey = (value: string): boolean => {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value,
    )
  ) {
    return false;
  }

  const decodedKey = Buffer.from(value, "base64");
  return [16, 24, 32].includes(decodedKey.length);
};

const nextServerActionsEncryptionKey = z
  .string()
  .refine(isBase64EncodedAesKey, {
    error:
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must be a base64-encoded AES key of 16, 24, or 32 bytes. Generate with: openssl rand -base64 32",
  });

const formatEnvValidationIssues = (
  issues: readonly StandardSchemaV1.Issue[],
): string => {
  const paths = issues.map((issue) => {
    const path = issue.path?.map(String).join(".");
    return path && path.length > 0 ? path : "<unknown>";
  });

  return `Invalid environment variables: ${paths.join(", ")}`;
};

const noTrailingSlashUrl = z.url().refine((v) => !v.endsWith("/"), {
  error: "must not end with trailing slash (paths are concatenated)",
});

export function isLocalhostUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const { hostname } = new URL(value);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

function isLocalhostDatabaseUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const { hostname } = new URL(value);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

const cloudRunIapJwtAudience = z
  .string()
  .regex(
    /^\/projects\/[1-9][0-9]*\/locations\/[a-z0-9-]+\/services\/[a-z0-9-]+$/u,
    {
      error:
        "IAP_JWT_AUDIENCE must match Cloud Run IAP audience /projects/PROJECT_NUMBER/locations/REGION/services/SERVICE_NAME",
    },
  );

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
    BETTER_AUTH_URL: noTrailingSlashUrl.optional(),

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
    // `ENCRYPTION_KEY_ID` はそれの kid（識別子、デフォルト "v1"）。
    ENCRYPTION_KEY: z
      .string()
      .length(64, { error: "ENCRYPTION_KEY must be exactly 64 characters" })
      .optional(),
    // Next.js self-hosting Server Actions encryption key.
    // The value is baked into the build and must stay consistent across instances.
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:
      nextServerActionsEncryptionKey.optional(),
    /** Primary key の識別子（kid）。1〜32 文字、`a-zA-Z0-9-_` のみ。未指定なら "v1"。 */
    ENCRYPTION_KEY_ID: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,32}$/u, {
        error:
          "ENCRYPTION_KEY_ID must be 1-32 chars of [a-zA-Z0-9_-] (e.g. 'v1', 'v2', 'k20260623')",
      })
      .optional(),

    // Audit log integrity（本番必須 - ランタイム検証）
    // 監査ログ hash chain の HMAC-SHA256 鍵。DB 内に保存しないこと。
    AUDIT_LOG_HMAC_KEY: z
      .string()
      .length(64, {
        error: "AUDIT_LOG_HMAC_KEY must be exactly 64 hex characters",
      })
      .regex(/^[0-9a-fA-F]+$/u, {
        error: "AUDIT_LOG_HMAC_KEY must contain only hex characters",
      })
      .optional(),
    AUDIT_LOG_HMAC_KEY_ID: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,32}$/u, {
        error: "AUDIT_LOG_HMAC_KEY_ID must be 1-32 chars of [a-zA-Z0-9_-]",
      })
      .optional(),

    // Cron（本番必須 - ランタイム検証）
    // Cloud Scheduler OIDC token の audience と発行元 service account を検証する。
    CRON_OIDC_AUDIENCE: noTrailingSlashUrl.optional(),
    CRON_SERVICE_ACCOUNT_EMAIL: z.email().optional(),

    // Database connection pool tuning
    DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .optional(),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .optional(),
    DATABASE_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .optional(),

    // Deployment surface
    APP_SURFACE: z.enum(["public", "admin"]).default("admin"),
    ADMIN_APP_URL: noTrailingSlashUrl.optional(),
    IAP_JWT_AUDIENCE: cloudRunIapJwtAudience.optional(),
    ADMIN_TEST_IAP_EMAIL: z.email().optional(),
    ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL: z.email().optional(),
    ADMIN_ROLE_GROUP_ADMIN_EMAIL: z.email().optional(),
    ADMIN_ROLE_GROUP_EDITOR_EMAIL: z.email().optional(),
    ADMIN_ROLE_GROUP_VIEWER_EMAIL: z.email().optional(),
    E2E_RUNTIME: z.enum(["1"]).optional(),
    E2E_FIXED_NOW_ISO: z.iso.datetime().optional(),

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
    CI: z.string().optional(),
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
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:
      process.env["NEXT_SERVER_ACTIONS_ENCRYPTION_KEY"],
    ENCRYPTION_KEY_ID: process.env["ENCRYPTION_KEY_ID"],
    AUDIT_LOG_HMAC_KEY: process.env["AUDIT_LOG_HMAC_KEY"],
    AUDIT_LOG_HMAC_KEY_ID: process.env["AUDIT_LOG_HMAC_KEY_ID"],
    CRON_OIDC_AUDIENCE: process.env["CRON_OIDC_AUDIENCE"],
    CRON_SERVICE_ACCOUNT_EMAIL: process.env["CRON_SERVICE_ACCOUNT_EMAIL"],
    DATABASE_POOL_MAX: process.env["DATABASE_POOL_MAX"],
    DATABASE_CONNECTION_TIMEOUT_MS:
      process.env["DATABASE_CONNECTION_TIMEOUT_MS"],
    DATABASE_IDLE_TIMEOUT_MS: process.env["DATABASE_IDLE_TIMEOUT_MS"],
    DATABASE_STATEMENT_TIMEOUT_MS: process.env["DATABASE_STATEMENT_TIMEOUT_MS"],
    DATABASE_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS:
      process.env["DATABASE_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS"],
    APP_SURFACE: process.env["APP_SURFACE"],
    ADMIN_APP_URL: process.env["ADMIN_APP_URL"],
    IAP_JWT_AUDIENCE: process.env["IAP_JWT_AUDIENCE"],
    ADMIN_TEST_IAP_EMAIL: process.env["ADMIN_TEST_IAP_EMAIL"],
    ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL:
      process.env["ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL"],
    ADMIN_ROLE_GROUP_ADMIN_EMAIL: process.env["ADMIN_ROLE_GROUP_ADMIN_EMAIL"],
    ADMIN_ROLE_GROUP_EDITOR_EMAIL: process.env["ADMIN_ROLE_GROUP_EDITOR_EMAIL"],
    ADMIN_ROLE_GROUP_VIEWER_EMAIL: process.env["ADMIN_ROLE_GROUP_VIEWER_EMAIL"],
    E2E_RUNTIME: process.env["E2E_RUNTIME"],
    E2E_FIXED_NOW_ISO: process.env["E2E_FIXED_NOW_ISO"],
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
    CI: process.env["CI"],
  },
  // This module imports "server-only"; tests install JSDOM, so `window` is not
  // a reliable server/runtime signal here.
  isServer: true,
  onValidationError: (issues) => {
    throw new Error(formatEnvValidationIssues(issues));
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
    { name: "BETTER_AUTH_URL", value: serverEnv.BETTER_AUTH_URL },
    { name: "TURNSTILE_SECRET_KEY", value: serverEnv.TURNSTILE_SECRET_KEY },
    { name: "ENCRYPTION_KEY", value: serverEnv.ENCRYPTION_KEY },
    {
      name: "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
      value: serverEnv.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,
    },
    { name: "AUDIT_LOG_HMAC_KEY", value: serverEnv.AUDIT_LOG_HMAC_KEY },
    { name: "CRON_OIDC_AUDIENCE", value: serverEnv.CRON_OIDC_AUDIENCE },
    {
      name: "CRON_SERVICE_ACCOUNT_EMAIL",
      value: serverEnv.CRON_SERVICE_ACCOUNT_EMAIL,
    },
    // Cloudflare R2 — 画像ストレージ必須
    { name: "R2_ACCOUNT_ID", value: serverEnv.R2_ACCOUNT_ID },
    { name: "R2_ACCESS_KEY_ID", value: serverEnv.R2_ACCESS_KEY_ID },
    { name: "R2_SECRET_ACCESS_KEY", value: serverEnv.R2_SECRET_ACCESS_KEY },
    { name: "R2_BUCKET_NAME", value: serverEnv.R2_BUCKET_NAME },
    { name: "R2_PUBLIC_URL", value: serverEnv.R2_PUBLIC_URL },
    {
      name: "CLOUDFLARE_ORIGIN_HEADER_SECRET",
      value: serverEnv.CLOUDFLARE_ORIGIN_HEADER_SECRET,
    },
    // NEXT_PUBLIC_* はビルド時に client JS へインライン化されるが、
    // Cloud Build substitution で未指定だと "" でビルドされ silent failure になる。
    // instrumentation.register() で起動時に fail-fast させる。
    {
      name: "NEXT_PUBLIC_BASE_URL",
      value: process.env["NEXT_PUBLIC_BASE_URL"],
    },
    { name: "NEXT_PUBLIC_APP_URL", value: process.env["NEXT_PUBLIC_APP_URL"] },
    {
      name: "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      value: process.env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"],
    },
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

  const localE2ERuntimeAllowed =
    serverEnv.E2E_RUNTIME === "1" &&
    isLocalhostUrl(serverEnv.ADMIN_APP_URL) &&
    isLocalhostUrl(serverEnv.BETTER_AUTH_URL) &&
    isLocalhostUrl(process.env["NEXT_PUBLIC_BASE_URL"]) &&
    isLocalhostUrl(process.env["NEXT_PUBLIC_APP_URL"]) &&
    isLocalhostDatabaseUrl(process.env["DATABASE_URL"]);
  const unsafeE2EOnlyEnv = [
    {
      name: "NEXT_PUBLIC_ENABLE_E2E_LOGIN",
      value: process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"],
    },
    { name: "E2E_RUNTIME", value: serverEnv.E2E_RUNTIME },
    { name: "ADMIN_TEST_IAP_EMAIL", value: serverEnv.ADMIN_TEST_IAP_EMAIL },
  ]
    .filter(({ value }) => value)
    .map(({ name }) => name);

  if (unsafeE2EOnlyEnv.length > 0 && !localE2ERuntimeAllowed) {
    throw new Error(
      `E2E/test-only environment variables are not allowed in production outside localhost E2E runtime: ${unsafeE2EOnlyEnv.join(", ")}`,
    );
  }

  if (serverEnv.APP_SURFACE === "admin") {
    const missingAdminEnv = [
      { name: "IAP_JWT_AUDIENCE", value: serverEnv.IAP_JWT_AUDIENCE },
      {
        name: "ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL",
        value: serverEnv.ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL,
      },
      {
        name: "ADMIN_ROLE_GROUP_ADMIN_EMAIL",
        value: serverEnv.ADMIN_ROLE_GROUP_ADMIN_EMAIL,
      },
      {
        name: "ADMIN_ROLE_GROUP_EDITOR_EMAIL",
        value: serverEnv.ADMIN_ROLE_GROUP_EDITOR_EMAIL,
      },
      {
        name: "ADMIN_ROLE_GROUP_VIEWER_EMAIL",
        value: serverEnv.ADMIN_ROLE_GROUP_VIEWER_EMAIL,
      },
    ]
      .filter(({ value }) => !value)
      .map(({ name }) => name);

    if (missingAdminEnv.length > 0) {
      throw new Error(
        `Missing required environment variables in production: ${missingAdminEnv.join(", ")}`,
      );
    }
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
