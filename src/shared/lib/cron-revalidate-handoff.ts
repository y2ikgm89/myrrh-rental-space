import "server-only";

import { GoogleAuth } from "google-auth-library";
import { serverEnv } from "@/shared/lib/env/server";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

/**
 * 予約公開の再検証を public サーフェスへ引き継ぐ。
 *
 * ## なぜ必要か
 *
 * `src/shared/lib/cache/site-wide.ts` の無効化は 2 段構えで、片方しか
 * プロセスを跨がない:
 *
 * - Cloudflare CDN の tag purge — 跨ぐ
 * - `revalidateTag(tag, { expire: 0 })` — **同一プロセス内のみ**
 *
 * cron service (`terraform/cloud_run_cron.tf`) を public から切り離した結果、
 * `news-scheduled-publish` / `blog-scheduled-publish` が後者を失った。
 *
 * **CDN purge だけで済ませられない。** `next.config.ts` の公開ページ blanket は
 * `s-maxage=3600, stale-while-revalidate=3600`。origin が stale のまま CDN を
 * purge すると、edge がその stale 応答を最大 1 時間 + SWR 1 時間だけ**焼き直す**。
 * origin 側の 1 時間と合わせて最悪 3 時間、公開済みの記事が出ない。
 *
 * ## 形
 *
 * 対象が見つかったときだけ public の同じ cron endpoint を叩く。public 側は
 * 同じ検出処理（look-back 20 分）を自プロセスで走らせ、`revalidateTag` と
 * CDN purge を**正しい順序で**行う。予約公開は稀なので、public を起こすのは
 * 実際に公開が発生したときだけで済み、費用への影響はほぼない。
 *
 * ## 無限ループが起きない理由
 *
 * `CRON_REVALIDATE_HANDOFF_URL` は cron service にしか入らない。ハンドオフを
 * 受けた public 側では未設定なので、そこから再ディスパッチは起きない。
 * 環境変数の有無が「自分は cron service か public か」を表している。
 *
 * ## 認証
 *
 * cron service の runtime SA で public の URL を audience とする OIDC ID token
 * を発行する。受け側は `authorizeCronRequest` の `additionalServiceAccountEmails`
 * で、この SA を Cloud Scheduler の SA に加えて受け入れる。
 */

let authClient: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  authClient ??= new GoogleAuth();
  return authClient;
}

/**
 * ハンドオフ先が設定されていれば再検証を依頼する。
 *
 * @returns 依頼が成功したら true。**呼び出し側は false のとき自前の
 *   無効化にフォールバックすること** — ハンドオフが落ちたまま何もしないと、
 *   CDN purge すら行われない。
 */
export async function dispatchRevalidationHandoff(
  path: string,
  operation: string,
): Promise<boolean> {
  const baseUrl = serverEnv.CRON_REVALIDATE_HANDOFF_URL;
  // public サーフェス上で動いている（= 自分が再検証すべき側）。
  if (!baseUrl) return false;

  const url = `${baseUrl}${path}`;
  try {
    const client = await getAuth().getIdTokenClient(baseUrl);
    const response = await client.request({ url, method: "GET" });
    // google-auth-library は非 2xx で throw するが、念のため明示的に見る。
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation, url },
    });
    return false;
  }
}
