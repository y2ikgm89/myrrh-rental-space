/**
 * URL ヘルパー関数
 *
 * 環境変数からの URL 取得とパス構築。
 *
 * production では NEXT_PUBLIC_BASE_URL / NEXT_PUBLIC_APP_URL の欠落を fatal 扱いし
 * 即時 throw する（30+ 箇所の `${BASE_URL}${path}` 連結に localhost が紛れ込む silent
 * SEO 汚染を runtime 層でも全廃）。build 層は cloudbuild substitution 必須化 +
 * Dockerfile 早期 assert で守られているため runtime throw は本来 unreachable だが、
 * 多重防御として残す（env が誤って差し変わった場合の fail-fast）。
 */

import { clientEnv } from "../env/client";

/** 開発環境専用の URL フォールバック（production では使用しない）。 */
const DEV_FALLBACK_URL = "http://localhost:3000";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function requireConfiguredUrl(
  value: string | undefined,
  name: string,
): string | null {
  if (value !== undefined) return value;
  if (isProduction()) {
    throw new Error(
      `${name} is not configured in production. cloudbuild substitution と Cloud Run env を確認してください（silent SEO 汚染防止）。`,
    );
  }
  return null;
}

/**
 * ベース URL を取得（公開サイト）。
 *
 * production 時に NEXT_PUBLIC_BASE_URL 未設定なら throw。
 * development 時は DEV_FALLBACK_URL を返す。
 */
export function getBaseUrl(): string {
  return (
    requireConfiguredUrl(
      clientEnv.NEXT_PUBLIC_BASE_URL,
      "NEXT_PUBLIC_BASE_URL",
    ) ?? DEV_FALLBACK_URL
  );
}

/**
 * アプリ URL を取得（公開アプリ / 顧客向けホスト）。
 *
 * NEXT_PUBLIC_APP_URL → NEXT_PUBLIC_BASE_URL の順でフォールバック。
 * production 時に両方未設定なら throw。
 * 管理画面リンクは server-only の `@/shared/lib/admin-urls` を使う。
 */
export function getAppUrl(): string {
  const explicit =
    clientEnv.NEXT_PUBLIC_APP_URL ?? clientEnv.NEXT_PUBLIC_BASE_URL;
  return (
    requireConfiguredUrl(
      explicit,
      "NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_BASE_URL",
    ) ?? DEV_FALLBACK_URL
  );
}

/**
 * アプリ URL のホスト名を取得（iCal UID の localpart@domain 用）
 *
 * 例: "https://example.com/foo" → "example.com"
 * URL 解析失敗時は "localhost" にフォールバック
 */
export function getAppHost(): string {
  try {
    return new URL(getAppUrl()).host;
  } catch {
    return "localhost";
  }
}
