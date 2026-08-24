/**
 * サーバー専用環境変数バリデーション
 *
 * @t3-oss/env-nextjs によるビルド時検証
 * シークレット類はここで定義
 *
 * ## 環境変数の必須/任意ルール
 *
 * **一覧をここに写さない（監査 A-84）。** 本番必須の正本は
 * このファイルの `validateProductionEnv()` 内の `requiredInProd` 配列と、
 * `APP_SURFACE === "admin"` のときに追加される IAP / role group の分岐。
 *
 * 旧記述は 9 変数だけを挙げて「その他: 任意」と宣言していたが、実際には
 * R2 6 本 / Cloudflare 3 本 / SUPPRESSION_HASH_SECRET / NEXT_PUBLIC_* も本番必須で、
 * 欠けると `instrumentation.register()` が throw して**リビジョンが起動しない**。
 * 「任意のはずの変数で起動しない」ので、まず env 検証以外を疑うことになる。
 *
 * 新しい環境を立ち上げるときの手引きは `.env.example`（各項に
 * "production required" を書いてある）。
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

import { parseSecondaryEncryptionKeys } from "./parse-secondary-encryption-keys";
import { UNSAFE_E2E_ONLY_ENV_KEYS } from "./unsafe-e2e-only-env-keys";

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
    // eslint-disable-next-line local/require-trimmed-text -- 環境変数の秘密値。空白混入はデプロイ設定の誤りなので黙って直さない
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: noTrailingSlashUrl.optional(),

    // Email (Resend)
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    EMAIL_FROM_NAME: z.string().optional(),
    /**
     * Resend Webhook 署名検証用シークレット（svix 形式 `whsec_...`）— local dev fallback。
     * 本番の canonical は `Settings.resendWebhookSecret` (DB 暗号化 + admin UI 管理、
     * Tier 2)。`getResendWebhookSecret()` が DB → env の順で解決する。DB / env どちらも
     * 未設定なら `/api/webhooks/resend` は 503 を返す。
     * @see https://resend.com/docs/webhooks/verify-webhooks-requests
     * @see [[project_integration-secrets-two-tier-split-2026-07-06]]
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
    // eslint-disable-next-line local/require-trimmed-text -- 同上
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
    /**
     * 鍵ローテーション時の secondary key list。書式は
     * `kid1:hex64,kid2:hex64` のカンマ区切り。**復号のみに使う**（encrypt は常に
     * primary）。値の詳細検証と parse は `getSecondaryEncryptionKeys()` が担う。
     * schema 側では length と文字クラスの粗検査に留めて、operator が
     * ダブル引用符 / 空白でうっかり壊した場合を運用時にも catch できるようにする。
     */
    SECONDARY_ENCRYPTION_KEYS: z
      .string()
      .regex(/^[a-zA-Z0-9_:,\s-]*$/u, {
        error:
          "SECONDARY_ENCRYPTION_KEYS must contain only [a-zA-Z0-9_-:,] characters",
      })
      .optional(),

    // Audit log integrity（本番必須 - ランタイム検証）
    // 監査ログ hash chain の HMAC-SHA256 鍵。DB 内に保存しないこと。
    // eslint-disable-next-line local/require-trimmed-text -- 同上
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

    // Suppression set hashing secret（本番必須 - M6）
    // `hashSuppressedEmailCandidate` で HMAC-SHA256 の鍵として使う。
    // 非本番では optional（unset 時は plain SHA-256 fallback）。本番は
    // `validateProductionEnv()` が fail-closed。
    // Recommended: 64+ random hex chars (`openssl rand -hex 64`).
    SUPPRESSION_HASH_SECRET: z.string().optional(),

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
    // お問い合わせ添付専用の private bucket（公開 CDN ドメインなし）。
    // Cloud Run 配線 (#1479) 完了後は本番必須（`validateProductionEnv`）。
    R2_INQUIRIES_BUCKET_NAME: z.string().optional(),

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
    // eslint-disable-next-line local/require-trimmed-text -- 同上
    CLOUDFLARE_API_TOKEN: z.string().min(40).optional(),
    /**
     * `x-cloudflare-origin-secret` として **受理してよい値の集合**（カンマ区切り）。
     *
     * 通常は 1 個。ローテーション中だけ「新,旧」の 2 個にする。集合にしないと
     * Cloudflare 側と Cloud Run 側を同時に切り替えられず、必ずミスマッチ窓ができて
     * その間 rate-limit が全 request 単一バケットに collapse する
     * （`shared/lib/rate-limit.ts` の `acceptedOriginSecrets` 参照）。
     *
     * 各要素は 32 文字以上。空要素は許さない（`",,"` のような取りこぼしを弾く）。
     */
    CLOUDFLARE_ORIGIN_HEADER_SECRET: z
      .string()
      .refine(
        (raw) => {
          const parts = raw.split(",").map((value) => value.trim());
          return parts.length > 0 && parts.every((value) => value.length >= 32);
        },
        {
          error:
            "CLOUDFLARE_ORIGIN_HEADER_SECRET must be a comma-separated list of secrets, each at least 32 chars (rotation uses two entries)",
        },
      )
      .optional(),

    // Runtime scaling hints
    //
    // Rate-limit store backend. Default `"in-memory"` (Cloud Run max-instances=1).
    // `MAX_INSTANCES_HINT` MUST be `1` when backend is `in-memory` (validateProductionEnv
    // hard-fails otherwise).
    RATE_LIMIT_BACKEND: z.literal("in-memory").default("in-memory"),
    MAX_INSTANCES_HINT: z.coerce.number().int().positive().optional(),

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
    SECONDARY_ENCRYPTION_KEYS: process.env["SECONDARY_ENCRYPTION_KEYS"],
    AUDIT_LOG_HMAC_KEY: process.env["AUDIT_LOG_HMAC_KEY"],
    AUDIT_LOG_HMAC_KEY_ID: process.env["AUDIT_LOG_HMAC_KEY_ID"],
    SUPPRESSION_HASH_SECRET: process.env["SUPPRESSION_HASH_SECRET"],
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
    R2_INQUIRIES_BUCKET_NAME: process.env["R2_INQUIRIES_BUCKET_NAME"],
    CLOUDFLARE_ZONE_ID: process.env["CLOUDFLARE_ZONE_ID"],
    CLOUDFLARE_API_TOKEN: process.env["CLOUDFLARE_API_TOKEN"],
    CLOUDFLARE_ORIGIN_HEADER_SECRET:
      process.env["CLOUDFLARE_ORIGIN_HEADER_SECRET"],
    RATE_LIMIT_BACKEND: process.env["RATE_LIMIT_BACKEND"],
    MAX_INSTANCES_HINT: process.env["MAX_INSTANCES_HINT"],
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
      name: "R2_INQUIRIES_BUCKET_NAME",
      value: serverEnv.R2_INQUIRIES_BUCKET_NAME,
    },
    {
      name: "CLOUDFLARE_ORIGIN_HEADER_SECRET",
      value: serverEnv.CLOUDFLARE_ORIGIN_HEADER_SECRET,
    },
    { name: "CLOUDFLARE_ZONE_ID", value: serverEnv.CLOUDFLARE_ZONE_ID },
    { name: "CLOUDFLARE_API_TOKEN", value: serverEnv.CLOUDFLARE_API_TOKEN },
    // M6 — suppression set HMAC。Phase C 配線後は本番必須。
    {
      name: "SUPPRESSION_HASH_SECRET",
      value: serverEnv.SUPPRESSION_HASH_SECRET,
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
    // E2E runtime (Playwright smoke / local next start) は CDN purge を使わない。
    // cloudflare.ts と同契約で ZONE_ID / API_TOKEN 欠落を許容する。
    .filter(({ name }) => {
      if (
        serverEnv.E2E_RUNTIME === "1" &&
        (name === "CLOUDFLARE_ZONE_ID" || name === "CLOUDFLARE_API_TOKEN")
      ) {
        return false;
      }
      return true;
    })
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
  const unsafeE2EOnlyEnvValues: Record<
    (typeof UNSAFE_E2E_ONLY_ENV_KEYS)[number],
    string | undefined
  > = {
    NEXT_PUBLIC_ENABLE_E2E_LOGIN: process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"],
    E2E_RUNTIME: serverEnv.E2E_RUNTIME,
    ADMIN_TEST_IAP_EMAIL: serverEnv.ADMIN_TEST_IAP_EMAIL,
  };
  const unsafeE2EOnlyEnv = UNSAFE_E2E_ONLY_ENV_KEYS.filter(
    (key) => unsafeE2EOnlyEnvValues[key],
  );

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

  // Secondary encryption keys — parse eagerly so a malformed rotation window
  // fails fast at startup instead of silently returning null from every
  // decrypt call. `parseSecondaryEncryptionKeys` is a pure parser and lives
  // in its own file so `server.ts` does not import through `encryption.ts`
  // (which imports `serverEnv` from us and would form a cycle).
  parseSecondaryEncryptionKeys(serverEnv.SECONDARY_ENCRYPTION_KEYS);

  // Rate limit backend vs Cloud Run max-instances contract.
  //
  // `InMemoryRateLimitStore` (LRUCache) is per-process. On a Cloud Run service
  // with autoscaling max-instances > 1, every documented rate limit is silently
  // multiplied by `MAX_INSTANCES` (each instance has its own bucket).
  //
  // Rate-limit is in-memory only (no Redis). Keep Cloud Run max-instances=1.
  if (
    serverEnv.RATE_LIMIT_BACKEND === "in-memory" &&
    typeof serverEnv.MAX_INSTANCES_HINT === "number" &&
    serverEnv.MAX_INSTANCES_HINT > 1
  ) {
    throw new Error(
      `RATE_LIMIT_BACKEND="in-memory" is incompatible with MAX_INSTANCES_HINT=${serverEnv.MAX_INSTANCES_HINT}. ` +
        "Every rate limit is silently multiplied by MAX_INSTANCES because LRUCache is per-process. " +
        "Lower `_MAX_INSTANCES` in cloudbuild.yaml back to 1. " +
        "Distributed Redis rate-limit is intentionally out of scope; use Cloudflare WAF / Turnstile for edge protection.",
    );
  }
}
