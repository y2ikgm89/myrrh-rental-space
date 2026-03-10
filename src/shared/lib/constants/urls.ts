/**
 * URL ヘルパー関数
 *
 * 環境変数からの URL 取得とパス構築
 */

import { clientEnv } from "../env/client";

/** 開発環境用フォールバック URL */
const DEV_FALLBACK_URL = "http://localhost:3000";

/**
 * ベース URL を取得
 *
 * NEXT_PUBLIC_BASE_URL → DEV_FALLBACK_URL の順でフォールバック
 */
export function getBaseUrl(): string {
  return clientEnv.NEXT_PUBLIC_BASE_URL ?? DEV_FALLBACK_URL;
}

/**
 * アプリ URL を取得
 *
 * NEXT_PUBLIC_APP_URL → NEXT_PUBLIC_BASE_URL → DEV_FALLBACK_URL の順でフォールバック
 */
export function getAppUrl(): string {
  return (
    clientEnv.NEXT_PUBLIC_APP_URL ??
    clientEnv.NEXT_PUBLIC_BASE_URL ??
    DEV_FALLBACK_URL
  );
}

/**
 * 管理画面 URL を構築
 *
 * @param path - /admin 以下のパス（例: '/reservations/123'）
 */
export function getAdminUrl(path: string): string {
  return `${getAppUrl()}/admin${path}`;
}

/**
 * 公開ページ URL を構築
 *
 * @param path - ルートからのパス（例: '/posts/my-post'）
 */
export function getPublicUrl(path: string): string {
  return `${getBaseUrl()}${path}`;
}
