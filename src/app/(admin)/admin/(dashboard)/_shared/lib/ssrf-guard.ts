import "server-only";

/**
 * プライベートIPアドレスかどうかをチェック
 * SSRF脆弱性対策として、内部ネットワークへのリクエストを禁止
 */
export function isPrivateOrReservedHost(hostname: string): boolean {
  // localhost
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    return true;
  }

  // IPv4のプライベートアドレス範囲をチェック
  const ipv4Match = hostname.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    if (
      a === undefined ||
      b === undefined ||
      c === undefined ||
      d === undefined
    )
      return false;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
    // 100.64.0.0/10 (carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 198.18.0.0/15 (benchmark testing)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // マルチキャスト 224.0.0.0/4
    if (a >= 224 && a <= 239) return true;
    // ブロードキャスト
    if (a === 255 && b === 255 && c === 255 && d === 255) return true;
  }

  // IPv6のプライベート/予約アドレス
  if (hostname.startsWith("[")) {
    const ipv6 = hostname.slice(1, -1).toLowerCase();
    // ::1 (loopback)
    if (ipv6 === "::1") return true;
    // fc00::/7 (unique local)
    if (ipv6.startsWith("fc") || ipv6.startsWith("fd")) return true;
    // fe80::/10 (link-local)
    if (ipv6.startsWith("fe80")) return true;
    // :: (unspecified)
    if (ipv6 === "::") return true;
  }

  // 一般的な内部ホスト名パターン
  const internalPatterns = [
    /^localhost$/i,
    /^.*\.local$/i,
    /^.*\.internal$/i,
    /^.*\.localdomain$/i,
    /^.*\.localhost$/i,
    /^kubernetes\.default/i,
    /^metadata\.google\.internal/i,
    /^169\.254\.169\.254/, // AWS/GCP metadata
  ];

  return internalPatterns.some((pattern) => pattern.test(hostname));
}

/**
 * URLが安全かどうかを検証
 * - HTTP/HTTPSのみ許可
 * - プライベート/予約アドレスへのアクセスを禁止
 * - 標準ポート（80, 443, 8080, 8443）以外を禁止
 */
export function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // HTTPとHTTPSのみ許可
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    // プライベート/予約アドレスへのアクセスを禁止
    if (isPrivateOrReservedHost(url.hostname)) {
      return false;
    }

    // ポート番号のチェック（標準ポート以外は警戒）
    const port = url.port
      ? parseInt(url.port, 10)
      : url.protocol === "https:"
        ? 443
        : 80;
    if (port !== 80 && port !== 443 && port !== 8080 && port !== 8443) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
