/**
 * 公開 chrome 向け auth kind（login / mypage / null）を返す軽量 endpoint。
 *
 * - Cookie 依存の個人化データのため CDN に乗せない（next.config `/api/:path*` =
 *   `private, no-store`。Response でも同値を二重防御）
 * - PII（email / name）は返さない。kind のみ
 *
 * @module api/customer/auth-kind
 */

import { NextResponse } from "next/server";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { resolvePublicAuthKind } from "@/shared/lib/public-auth-kind";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export async function GET(): Promise<Response> {
  const user = await getCurrentCustomerUser();
  const kind = resolvePublicAuthKind(user);
  return NextResponse.json(
    { kind },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
