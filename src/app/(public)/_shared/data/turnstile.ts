/**
 * Turnstile siteKey 取得レイヤー
 *
 * DB の Settings から Turnstile Site Key を取得。
 * Client Component に siteKey を渡すための Server データ関数。
 * Secret Key は返さない（サーバー側検証のみで使用）。
 */

import { getTurnstileConfig } from "@/shared/domain/settings/api-key-queries";

/**
 * Turnstile Site Key を取得（null = 未設定 → ウィジェット非表示）
 */
export async function getTurnstileSiteKey(): Promise<string | null> {
  const config = await getTurnstileConfig();
  // siteKey と secretKey の両方が設定済みの場合のみ有効
  return config.siteKey && config.secretKeyMasked ? config.siteKey : null;
}
