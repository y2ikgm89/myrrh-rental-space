/**
 * ソーシャル OAuth grant を upstream で revoke する best-effort ヘルパー。
 *
 * Better Auth の `unlinkAccount` は DB の Account row のみを削除し、Google/LINE 側の
 * grant はそのまま残る。「連携解除」の UX 心証と乖離しない（GDPR 第 17 条の propagation
 * 論点にも触れる）よう、DB row 削除の前に upstream の revoke endpoint を叩く。
 *
 * 呼び出しは best-effort: upstream の 4xx/5xx / network 障害でも DB 側の unlink を
 * ブロックしない（ユーザーの解除意図を尊重するのが最優先で、grant の残存は
 * 次回 OAuth 同意画面での consent refresh でも解消される）。失敗は `logError` の
 * MEDIUM で残す（監査目的）。
 *
 * @module shared/lib/oauth-revoke
 */

import "server-only";

import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { withGoogleApiRetry } from "@/shared/lib/google-api/retry";
import { fetchPublicHttpResource } from "@/shared/lib/ssrf-guard";
import { serverEnv } from "@/shared/lib/env/server";

const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const LINE_REVOKE_ENDPOINT = "https://api.line.me/oauth2/v2.1/revoke";
const REVOKE_TIMEOUT_MS = 5_000;

/**
 * Google OAuth grant を revoke する。
 *
 * `POST https://oauth2.googleapis.com/revoke` に access_token か refresh_token を渡すと
 * 対応する grant 全体が失効する。返答 200 以外は best-effort で握りつぶす。
 *
 * @see https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke
 */
export async function revokeGoogleOAuthGrant(token: string): Promise<void> {
  if (!token) return;
  try {
    const body = new URLSearchParams({ token });
    await withGoogleApiRetry(async () => {
      const response = await fetchPublicHttpResource(GOOGLE_REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw Object.assign(
          new Error(
            `Google revoke returned non-2xx status: ${String(response.status)}`,
          ),
          { status: response.status },
        );
      }
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "revokeGoogleOAuthGrant" },
    });
  }
}

/**
 * LINE OAuth grant を revoke する。
 *
 * `POST https://api.line.me/oauth2/v2.1/revoke` に `access_token` + `client_id` +
 * `client_secret` を渡すと対応する grant が失効する。client credentials が env に
 * 無ければ silent no-op（DB unlink は続行）。
 *
 * @see https://developers.line.biz/en/reference/line-login/#revoke-access-token
 */
export async function revokeLineOAuthGrant(token: string): Promise<void> {
  if (!token) return;
  const clientId = serverEnv.LINE_CLIENT_ID;
  const clientSecret = serverEnv.LINE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    // 設定不備は unlink 阻害せず silent no-op（BetterAuth の social provider 判定と
    // 同じ policy: 資格情報未設定なら feature 無効扱い）。
    return;
  }
  try {
    const body = new URLSearchParams({
      access_token: token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const response = await fetchPublicHttpResource(LINE_REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
    if (!response.ok) {
      logError(
        new Error(
          `LINE revoke returned non-2xx status: ${String(response.status)}`,
        ),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: { operation: "revokeLineOAuthGrant" },
        },
      );
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "revokeLineOAuthGrant" },
    });
  }
}

/**
 * providerId に応じて適切な revoke ヘルパーへ dispatch する。未対応 provider は
 * silent no-op（未知 provider の unlink を DB レベルで妨げないため）。
 */
export async function revokeOAuthGrantForProvider(
  providerId: string,
  token: string,
): Promise<void> {
  if (providerId === "google") {
    await revokeGoogleOAuthGrant(token);
    return;
  }
  if (providerId === "line") {
    await revokeLineOAuthGrant(token);
    return;
  }
}
