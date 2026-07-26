/**
 * Request Host が loopback かどうかを判定する SSoT。
 *
 * auth / E2E のセキュリティ bypass は env だけでは不十分で、実際のリクエスト
 * Host（および任意の X-Forwarded-Host）も localhost / 127.0.0.1 / ::1 である
 * ことを要求する（staging preview 等への漏れを fail-closed で防ぐ）。
 */

/** hostname（port なし）が loopback か。 */
export function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

/**
 * `Host` / `X-Forwarded-Host` 値（`host:port` や `[::1]:3000`、カンマ区切り）を
 * 解釈し、loopback なら true。
 */
export function isLoopbackHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false;

  const first = hostHeader.split(",")[0]?.trim();
  if (!first) return false;

  let hostname = first;
  if (hostname.startsWith("[")) {
    const end = hostname.indexOf("]");
    if (end === -1) return false;
    hostname = hostname.slice(1, end);
  } else {
    const colon = hostname.indexOf(":");
    // IPv4 / hostname:port のみ port を剥がす（生 ::1 はここに来ない）
    if (colon !== -1) {
      hostname = hostname.slice(0, colon);
    }
  }

  return isLoopbackHostname(hostname);
}

/**
 * リクエストの Host 系ヘッダがすべて loopback か（fail-closed）。
 *
 * - `Host` 必須。欠落・非 loopback は拒否
 * - `X-Forwarded-Host` がある場合も loopback 必須（spoof で bypass を開かない）
 * - 任意の `requestUrl` がある場合、その hostname も loopback 必須
 */
export function isLoopbackRequestHost(
  headers: Headers,
  requestUrl?: string | URL,
): boolean {
  const host = headers.get("host");
  if (!isLoopbackHost(host)) return false;

  const forwarded = headers.get("x-forwarded-host");
  if (forwarded !== null && !isLoopbackHost(forwarded)) return false;

  if (requestUrl !== undefined) {
    try {
      const { hostname } = new URL(requestUrl);
      if (!isLoopbackHostname(hostname)) return false;
    } catch {
      return false;
    }
  }

  return true;
}
