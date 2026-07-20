import "server-only";

import { headers } from "next/headers";
import { getClientIpFromHeaders } from "@/shared/lib/rate-limit";

/**
 * Server Action の AuditLog metadata へ載せる request context（ip / userAgent）を
 * next/headers から取得する SSoT helper。
 *
 * RECENT-03 系フォレンジック対称化: admin / customer どちらの Server Action でも
 * `headers().get("user-agent")` と `getClientIpFromHeaders()`（本番では
 * `cf-connecting-ip` + `x-cloudflare-origin-secret` timing-safe 一致時のみ信頼）を
 * 揃えて metadata に載せる。実装が経路ごとに分岐すると片方だけ userAgent=null
 * が焼き込まれる silent regression が起きるため、ここに一本化する。
 *
 * 戻り値の型は「domain の `CancelRequestContext` にも直接渡せる」形状
 * （`{ ip: string | null; userAgent: string | null }`）。`getClientIpFromHeaders`
 * 自体は "unknown" を含む string を必ず返すが、caller の抽象度に合わせて widening
 * している。
 *
 * # request-scope 外で呼ばれるケース
 *
 * integration test / seed / cron などの Next request scope 外から server action を
 * 直接呼ぶと `headers()` は
 *   Error: `headers` was called outside a request scope.
 * を throw する。この helper は AuditLog の "あれば残す" metadata なので、
 * scope 外では黙って `{ ip: null, userAgent: null }` にフォールバックする。
 * 呼び出し側は失敗を意識しなくて済み、既存の request-scope 内挙動 (実 IP / UA)
 * は完全に温存される。同型パターンは `_shared/lib/audit.ts:getRequestMetadata`
 * が既に採用している (`return {}` fallback)。
 */
export async function buildAuditRequestContext(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  try {
    const requestHeaders = await headers();
    const ip = await getClientIpFromHeaders();
    const userAgent = requestHeaders.get("user-agent");
    return { ip, userAgent };
  } catch {
    return { ip: null, userAgent: null };
  }
}
