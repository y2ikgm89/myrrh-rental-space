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
 */
export async function buildAuditRequestContext(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  const requestHeaders = await headers();
  const ip = await getClientIpFromHeaders();
  const userAgent = requestHeaders.get("user-agent");
  return { ip, userAgent };
}
