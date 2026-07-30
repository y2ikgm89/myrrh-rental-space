/**
 * Lighthouse CI の runtime env 契約（副作用なしモジュール）。
 *
 * `scripts/lhci-start.ts` はサーバーを spawn するため import できない。
 * 契約だけをここに切り出し、`__tests__/unit/architecture/lighthouse-ci-env.test.ts`
 * が実際に `validateProductionEnv()` を実行して検証できるようにする。
 *
 * @see scripts/lhci-start.ts
 */

/** `.lighthouserc.json` の `startServerReadyPattern` と一致させること。 */
export const LHCI_READY_MARKER = "LHCI_SERVER_READY";

export const LHCI_BASE_URL = "http://localhost:3000";

/**
 * `validateProductionEnv()` の本番必須 env を localhost 専用値で埋める。
 *
 * - `APP_SURFACE=public`: Lighthouse は公開ページのみ計測する（visual-regression job と同方針）。
 *   admin にすると IAP_JWT_AUDIENCE / ADMIN_ROLE_GROUP_* も必須になる。
 * - `E2E_RUNTIME=1`: production build を localhost で動かす際の既定契約。
 *   `assertCloudflareCredentials()` の起動時 canary purge（外部 API 呼び出し）を抑止し、
 *   `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_API_TOKEN` の必須判定を免除する。
 *   Turnstile / rate limit の bypass は **フォーム送信時のみ**適用されるため、
 *   ページ描画結果（= Lighthouse の計測対象）には影響しない。
 *
 * ダミー値は実サービスに接続しない前提のプレースホルダであり、本番デプロイには使わないこと。
 */
export const LHCI_PRODUCTION_ENV_FALLBACKS: Readonly<Record<string, string>> = {
  APP_SURFACE: "public",
  E2E_RUNTIME: "1",
  ADMIN_APP_URL: LHCI_BASE_URL,
  BETTER_AUTH_URL: LHCI_BASE_URL,
  ENCRYPTION_KEY: "0".repeat(64),
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  AUDIT_LOG_HMAC_KEY: "0".repeat(64),
  AUDIT_LOG_HMAC_KEY_ID: "lhci",
  SUPPRESSION_HASH_SECRET: "0".repeat(64),
  CLOUDFLARE_ORIGIN_HEADER_SECRET: "e".repeat(32),
  CRON_OIDC_AUDIENCE: LHCI_BASE_URL,
  CRON_SERVICE_ACCOUNT_EMAIL: "scheduler-ci@example.iam.gserviceaccount.com",
  R2_ACCOUNT_ID: "lhci-local-r2-account",
  R2_ACCESS_KEY_ID: "lhci-local-r2-access-key",
  R2_SECRET_ACCESS_KEY: "lhci-local-r2-secret-key-32-min!!",
  R2_BUCKET_NAME: "lhci-local-bucket",
  R2_INQUIRIES_BUCKET_NAME: "lhci-local-inquiries-bucket",
  R2_PUBLIC_URL: "https://example.com",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  NEXT_PUBLIC_BASE_URL: LHCI_BASE_URL,
  NEXT_PUBLIC_APP_URL: LHCI_BASE_URL,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
};

/** 既存の env を尊重しつつ（未設定 / 空文字のみ）fallback を適用する。 */
export function applyLhciProductionFallbacks(
  env: Record<string, string | undefined> = process.env,
): void {
  for (const [key, value] of Object.entries(LHCI_PRODUCTION_ENV_FALLBACKS)) {
    const current = env[key];
    if (current === undefined || current === "") {
      env[key] = value;
    }
  }
}
