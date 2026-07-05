/**
 * Turnstile siteKey 取得レイヤー
 *
 * DB の Settings から Turnstile Site Key を取得。
 * Client Component に siteKey を渡すための Server データ関数。
 * Secret Key は返さない（サーバー側検証のみで使用）。
 */

import { cacheLife, cacheTag } from "next/cache";
import { getTurnstileConfig } from "@/shared/domain/settings/api-key-queries";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import { clientEnv } from "@/shared/lib/env/client";
import { serverEnv } from "@/shared/lib/env/server";

/**
 * Turnstile Site Key を取得（null = 未設定 → ウィジェット非表示）
 *
 * 公開ページの全フォーム描画ごとに DB findUnique + AES-GCM 復号が走るのを
 * 回避するため `'use cache'` 化。`INTEGRATION_SETTINGS` タグは管理画面の
 * API キー mutation で `updateTag` 済（公式パターン）。
 */
export async function getTurnstileSiteKey(): Promise<string | null> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.INTEGRATION_SETTINGS);

  const config = await getTurnstileConfig();
  const siteKey = config.siteKey ?? clientEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const hasSecret = Boolean(
    config.secretKeyMasked || serverEnv.TURNSTILE_SECRET_KEY,
  );
  return siteKey && hasSecret ? siteKey : null;
}
