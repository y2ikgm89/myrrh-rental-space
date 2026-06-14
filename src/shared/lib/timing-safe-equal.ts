/**
 * 定数時間文字列比較
 *
 * シークレットトークン（CRON_SECRET / Cloudflare origin secret 等）の比較で
 * タイミング攻撃を防ぐための constant-time 比較。
 *
 * `crypto.subtle.timingSafeEqual` は全ランタイムで利用できるとは限らないため、
 * TextEncoder + XOR による runtime 非依存の実装を用いる（Edge / Node.js proxy
 * の双方で動作する）。長さが異なる場合は即 false（長さ自体は秘匿しない前提）。
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  let result = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    result |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return result === 0;
}
