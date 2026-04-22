/**
 * Lighthouse CI 用の本番相当サーバー起動スクリプト。
 *
 * `next start` では NODE_ENV=production のため `instrumentation.register()` 内の
 * `validateProductionEnv()` が実行され、ENCRYPTION_KEY / R2 系などが未設定だと 500 になる。
 * 開発用の `next dev` では同チェックがスキップされるため、この問題は LHCI やローカルの
 * `next start` 検証時にのみ顕在化する。
 *
 * 処理内容:
 * 1. `.env` → `.env.local` の順で読み込み（後者が優先）
 * 2. まだ欠けている本番ゲート用変数だけ、ローカル/LHCI 専用のダミーを埋める
 * 3. `build:skip-env` の後 `next start`（子プロセスへ環境を引き継ぐ）
 *
 * ダミー値は実サービスに接続しない前提のプレースホルダであり、本番デプロイには使わないこと。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";

/**
 * リポジトリ標準の env ファイルを読み込む。
 * `.env.local` で `.env` を上書きできるようにする。
 */
function loadDotenvFiles(): void {
  if (existsSync(".env")) {
    loadEnv({ path: ".env" });
  }
  if (existsSync(".env.local")) {
    loadEnv({ path: ".env.local", override: true });
  }
}

/**
 * `validateProductionEnv` が要求するキーのうち、未設定のものだけダミーで埋める。
 */
function applyLhciProductionFallbacks(): void {
  const hex64 = "0".repeat(64);
  /** serverEnv の z.string().min(32) を満たすプレースホルダ */
  const token32 = "x".repeat(32);

  const fallbacks: Record<string, string> = {
    ENCRYPTION_KEY: hex64,
    CRON_SECRET: token32,
    ADMIN_LOGIN_TOKEN: token32,
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

loadDotenvFiles();
applyLhciProductionFallbacks();

const build = spawnSync("bun", ["run", "build:skip-env"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

if (build.status !== 0 && build.status !== null) {
  process.exit(build.status);
}

const start = spawnSync("bun", ["x", "next", "start"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(start.status ?? 1);
