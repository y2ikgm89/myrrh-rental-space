"use server";

import { cookies, headers } from "next/headers";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { recordTermsAgreementsCommand } from "@/shared/domain/terms/commands";
import { TERMS_AGREEMENT_CONTEXT } from "@/shared/lib/validations/terms";
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
 */
export async function consumeSignupTermsAction(input: {
  isNew: boolean;
}): Promise<void> {
  const cookieStore = await cookies();
  const signupCookie = cookieStore.get(SIGNUP_TERMS_COOKIE_NAME);
  if (!signupCookie) return;

  // 再利用防止のため既存顧客でも cookie を削除（Server Action なので合法）
  cookieStore.delete(SIGNUP_TERMS_COOKIE_NAME);

  if (!input.isNew) return;

  const termsIds = decodeSignupTermsCookie(signupCookie.value);
  if (termsIds.length === 0) return;

  // 現在のセッションから customer を再解決（client 入力は信用しない）
  const { user } = await verifyCustomerSession();
  const { customer } = await ensureCustomerLinked(user);

  const clientIp = await getClientIpFromHeaders();
  const headersList = await headers();
  const userAgent = headersList.get("user-agent");

  await recordTermsAgreementsCommand({
    termsIds,
    context: TERMS_AGREEMENT_CONTEXT.SIGNUP,
    customerId: customer.id,
    ipAddress: clientIp,
    userAgent: userAgent ?? null,
  });
}
