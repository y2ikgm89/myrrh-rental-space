import "server-only";

import { lookup } from "node:dns/promises";

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
 * URL の同期的事前検証（protocol / hostname / port のみ）。
 *
 * 単独使用は **不十分** — DNS rebinding 攻撃を防げない（hostname が public IP に
 * 解決されると判定して通過させた後、実 fetch 時に再 DNS lookup で private IP に
 * すり替えられる可能性）。`isUrlSafe()` の前段ガードとして使用する。
 */
export function isUrlSafeSync(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // HTTPとHTTPSのみ許可
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    // プライベート/予約アドレスへのアクセスを禁止（hostname 文字列レベル）
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

/**
 * URL が安全かどうかを検証（DNS rebinding 対策含む完全版）。
 *
 * 検査順序:
 * 1. {@link isUrlSafeSync} で protocol / hostname literal / port を事前判定
 * 2. DNS lookup（`node:dns/promises`）で hostname → IP を解決
 * 3. 解決された IP が private / reserved range に該当しないか再判定
 *
 * これにより `evil.example.com → 169.254.169.254` の DNS rebinding 攻撃を遮断する。
 * DNS lookup 失敗時は fail-closed（不安全とみなす）。
 *
 * **注意**: 完全な DNS rebinding 対策には IP を pin した fetch（`undici` dispatcher
 * 経由）が必要だが、Node native fetch では TLS SNI / certificate validation との
 * 兼ね合いで困難。OGP プレビュー用途では 1) admin 認証必須 2) timeout 10s
 * 3) この pre-check で実運用上のリスクを大幅に低減できる。
 */
export async function isUrlSafe(urlString: string): Promise<boolean> {
  if (!isUrlSafeSync(urlString)) {
    return false;
  }

  try {
    const url = new URL(urlString);
    // hostname が既に IPv4/IPv6 リテラルなら lookup は冗長だが、family 一貫性のため通す
    const { address } = await lookup(url.hostname);
    return !isPrivateOrReservedHost(address);
  } catch {
    return false;
  }
}
