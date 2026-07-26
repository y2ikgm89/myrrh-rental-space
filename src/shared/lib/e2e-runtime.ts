import "server-only";

import { headers } from "next/headers";
import { isLocalhostUrl, serverEnv } from "./env/server";
import { isLoopbackRequestHost } from "./request-host";

/**
 * production build + E2E_RUNTIME=1 + 全関連 URL が localhost の env ゲート。
 * リクエスト Host は見ない（Better Auth 初期化など request 外の設定用）。
 */
export function isLocalProductionE2EEnv(): boolean {
  return (
    serverEnv.NODE_ENV === "production" &&
    serverEnv.E2E_RUNTIME === "1" &&
    isLocalhostUrl(serverEnv.ADMIN_APP_URL) &&
    isLocalhostUrl(serverEnv.BETTER_AUTH_URL) &&
    isLocalhostUrl(process.env["NEXT_PUBLIC_BASE_URL"]) &&
    isLocalhostUrl(process.env["NEXT_PUBLIC_APP_URL"])
  );
}

/**
 * Turnstile / publicQuery RL / test-IAP（production）など、セキュリティ bypass 用。
 * env ゲートに加え、リクエスト Host（と任意の X-Forwarded-Host）が loopback
 * であることを要求する。
 */
export function isE2ESecurityBypassAllowed(requestHeaders: Headers): boolean {
  return isLocalProductionE2EEnv() && isLoopbackRequestHost(requestHeaders);
}

export async function isE2ESecurityBypassAllowedFromHeaders(
  requestHeaders?: Headers,
): Promise<boolean> {
  const hdrs = requestHeaders ?? (await headers());
  return isE2ESecurityBypassAllowed(hdrs);
}

/** customer E2E login の env opt-in（request Host は見ない。cookie 設定用）。 */
export function isCustomerE2ELoginEnvEnabled(): boolean {
  return (
    process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"] === "1" &&
    isLocalProductionE2EEnv()
  );
}

/** リクエスト経路の customer E2E login（env + loopback Host）。 */
export function isCustomerE2ELoginEnabled(requestHeaders: Headers): boolean {
  return (
    isCustomerE2ELoginEnvEnabled() && isLoopbackRequestHost(requestHeaders)
  );
}
