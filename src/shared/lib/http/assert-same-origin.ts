import "server-only";

import { getAdminAppUrl } from "@/shared/lib/admin-urls";

function parseOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF defense-in-depth: `Origin` を優先し、欠落時は `Referer` の origin を使う。
 * いずれも欠落・不正なら null（fail-closed）。
 */
export function resolveRequestOrigin(headers: Headers): string | null {
  const origin = headers.get("origin");
  if (origin) {
    return parseOrigin(origin);
  }

  const referer = headers.get("referer");
  if (referer) {
    return parseOrigin(referer);
  }

  return null;
}

/** Admin surface mutation が許可する origin（`ADMIN_APP_URL` 系 SSoT）。 */
export function getExpectedAdminOrigin(): string {
  return parseOrigin(getAdminAppUrl()) ?? getAdminAppUrl();
}

/**
 * Admin Route Handler の state-changing POST 向け same-origin 判定。
 * session/IAP 認証に加え、クロスサイト form POST を拒否する。
 */
export function isSameAdminOrigin(headers: Headers): boolean {
  const requestOrigin = resolveRequestOrigin(headers);
  if (!requestOrigin) return false;
  return requestOrigin === getExpectedAdminOrigin();
}
