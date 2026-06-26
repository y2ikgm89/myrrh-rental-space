"use server";

import { cookies, headers } from "next/headers";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { recordTermsAgreementsCommand } from "@/shared/domain/terms/commands";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import {
  SIGNUP_TERMS_COOKIE_NAME,
  decodeSignupTermsCookie,
} from "@/shared/lib/signup-terms-cookie";
import { getClientIpFromHeaders } from "@/shared/lib/rate-limit";

/**
 * 公開ログインで集めた signup 同意 cookie を OAuth callback 後の mypage 初期表示で消費する。
 *
 * Server Action にする理由（公式準拠）:
 *   Next.js は Server Component 内での cookie set/delete を ReadonlyRequestCookiesError で禁ずる。
 *   `mypage/layout.tsx` の `MypageAuthGate` (async SC) から直接削除すると runtime throw → error
 *   boundary に flip して mypage が表示されない。Next.js 公式 canonical pattern (Server Action +
 *   Client Component) に従い隔離する。
 *
 *   - 公式: docs/01-app/02-guides/data-security.mdx "BAD: Triggering Mutation During Rendering"
 *   - 公式 e2e: test/e2e/app-dir/phase-changes/app/cookies/action-to-render
 *
 * 法務的順序保証: `recordTermsAgreementsCommand` を await した後に cookie を削除する。
 * 旧版は cookie を先に消していたため、記録失敗時に同意 evidence が永久消失していた
 * (法務的に致命的 — 「ユーザーが同意した証跡」が残らない)。
 */
export async function consumeSignupTermsAction(input: {
  isNew: boolean;
}): Promise<void> {
  const cookieStore = await cookies();
  const signupCookie = cookieStore.get(SIGNUP_TERMS_COOKIE_NAME);
  if (!signupCookie) return;

  if (!input.isNew) {
    // 再利用防止のため既存顧客でも cookie を削除（Server Action なので合法）
    cookieStore.delete(SIGNUP_TERMS_COOKIE_NAME);
    return;
  }

  const termsIds = decodeSignupTermsCookie(signupCookie.value);
  if (termsIds.length === 0) {
    cookieStore.delete(SIGNUP_TERMS_COOKIE_NAME);
    return;
  }

  // 現在のセッションから customer を再解決（client 入力は信用しない）
  const { user } = await verifyCustomerSession();
  const { customer } = await ensureCustomerLinked(user);

  const clientIp = await getClientIpFromHeaders();
  const headersList = await headers();
  const userAgent = headersList.get("user-agent");

  // 先に記録を確定 → 成功後に cookie 削除。recordTermsAgreementsCommand 内で throw
  // した場合は cookie を残し、ユーザーが再ログインした際に再度処理されるようにする。
  await recordTermsAgreementsCommand({
    termsIds,
    scope: TermsScope.LOGIN_SIGNUP,
    customerId: customer.id,
    ipAddress: clientIp,
    userAgent: userAgent ?? null,
  });

  cookieStore.delete(SIGNUP_TERMS_COOKIE_NAME);
}
