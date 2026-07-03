#!/usr/bin/env bun
/**
 * Lighthouse CI 用の本番相当サーバー起動スクリプト。
 *
 * `next start` では NODE_ENV=production のため `instrumentation.register()` 内の
 * `validateProductionEnv()` が実行され、ENCRYPTION_KEY / R2 系などが未設定だと 500 になる。
 * 開発用の `next dev` では同チェックがスキップされるため、この問題は LHCI やローカルの
 * `next start` 検証時にのみ顕在化する。
 *
 * 公式準拠（bun.com/docs）:
 * - Bun runtime は `.env` → `.env.{NODE_ENV}` → `.env.local` の順で auto-load（`.env.local` が最優先）
 * - `Bun.spawnSync([...], options)` の primary form（配列引数）採用
 * - `env: { ...process.env, ... }` でサブプロセスに env 継承
 *
 * ダミー値は実サービスに接続しない前提のプレースホルダであり、本番デプロイには使わないこと。
 */

function applyLhciProductionFallbacks(): void {
  const hex64 = "0".repeat(64);

  const fallbacks: Record<string, string> = {
    ENCRYPTION_KEY: hex64,
    CRON_OIDC_AUDIENCE: "http://localhost:3000",
    CRON_SERVICE_ACCOUNT_EMAIL: "scheduler-ci@example.iam.gserviceaccount.com",
    R2_ACCOUNT_ID: "lhci-local-r2-account",
    R2_ACCESS_KEY_ID: "lhci-local-r2-access-key",
    R2_SECRET_ACCESS_KEY: "lhci-local-r2-secret-key-32-min!!",
    R2_BUCKET_NAME: "lhci-local-bucket",
    R2_PUBLIC_URL: "https://example.com",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  };

  for (const [key, value] of Object.entries(fallbacks)) {
    const current = process.env[key];
    if (current === undefined || current === "") {
      process.env[key] = value;
    }
  }
}

applyLhciProductionFallbacks();

const buildScript = process.env["CI"]
  ? "build:skip-env:prepared"
  : "build:skip-env";

const build = Bun.spawnSync(["bun", "run", buildScript], {
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});

if (!build.success) {
  process.exit(build.exitCode);
}

const start = Bun.spawnSync(["bunx", "--bun", "next", "start"], {
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});

process.exit(start.exitCode);
