"use server";

import { cookies, headers } from "next/headers";
import { requireMypageSession } from "@/shared/lib/customer-auth/gates";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { recordTermsAgreementsCommand } from "@/shared/domain/terms/commands";
import { hasTermsAgreementRecorded } from "@/shared/domain/terms/queries";
import { assertAllRequiredTermsAgreed } from "@/shared/domain/terms/consent-gate";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import {
  SIGNUP_TERMS_COOKIE_NAME,
  decodeSignupTermsCookie,
} from "@/shared/lib/signup-terms-cookie";
import { getClientIpFromHeaders } from "@/shared/lib/rate-limit";

/**
 * 公開ログインで集めた signup 同意 cookie を OAuth callback 後に消費する。
 *
 * mypage 初期表示（`SignupTermsConsumer`）と、ゲスト予約/イベント参加の claim
 * コールバック（`/claim/reservation`・`/claim/event-registration` の Server Action）の
 * 両方から呼ばれる共通ロジックのため `(public)/_shared/actions` に置く。
 *
 * Server Action にする理由（公式準拠）:
 *   Next.js は Server Component 内での cookie set/delete を ReadonlyRequestCookiesError で禁ずる。
 *   `mypage/layout.tsx` の `MypageAuthGate` (async SC) から直接削除すると runtime throw → error
 *   boundary に flip して mypage が表示されない。Next.js 公式 canonical pattern (Server Action +
 *   Client Component) に従い隔離する。
 *
 *   - 公式: https://nextjs.org/docs/app/guides/data-security
 *     "Avoiding side-effects during rendering" (`// BAD: Triggering a mutation during rendering`)
 *   - 公式 e2e: vercel/next.js の
 *     `test/e2e/app-dir/phase-changes/app/cookies/action-to-render`
 *
 * 法務的順序保証: `recordTermsAgreementsCommand` を await した後に cookie を削除する。
 * 旧版は cookie を先に消していたため、記録失敗時に同意 evidence が永久消失していた
 * (法務的に致命的 — 「ユーザーが同意した証跡」が残らない)。
 *
 * MYPAGE-AUTH-03 (2026-07-18): isNew による早期 return を廃止。
 *   旧版は `if (!isNew) return` していたため、初回訪問で TermsAgreement insert が
 *   一時的 DB error 等で失敗した場合、次回訪問時は isNew=false なので cookie が
 *   残っていても retry されず、同意 evidence が永久消失していた。
 *   現版は cookie の presence を判定基準にし、insert 成功時にのみ cookie 削除する
 *   (transient failure からの自動回復)。retry で duplicate row を積まないよう、
 *   insert 前に `hasTermsAgreementRecorded` で idempotency 判定する
 *   (append-only 契約は維持 — upsert しない、既存があれば skip)。
 */
export async function consumeSignupTermsAction(): Promise<void> {
  const cookieStore = await cookies();
  const signupCookie = cookieStore.get(SIGNUP_TERMS_COOKIE_NAME);
  if (!signupCookie) return;

  const termsIds = decodeSignupTermsCookie(signupCookie.value);
  if (termsIds.length === 0) {
    // cookie が改竄 / 期限切れ → 削除して終了 (retry 対象外)。
    cookieStore.delete(SIGNUP_TERMS_COOKIE_NAME);
    return;
  }

  // 現在のセッションから customer を再解決（client 入力は信用しない）
  const { user } = await requireMypageSession();
  const { customer } = await ensureCustomerLinked(user);
  await assertCustomerActive(customer.id);

  // Idempotency: 同じ customer + LOGIN_SIGNUP scope + 要求 termsIds がすべて
  // 揃って記録済みなら cookie は「消費済みだが削除が persist しなかった
  // residual」と見做し、insert せず cookie だけ削除する。
  // 1 件でも欠ける場合は false（部分記録は idempotent とみなさない）。
  // append-only 契約 (upsert しない、insert only + collision → skip) を維持。
  const alreadyRecorded = await hasTermsAgreementRecorded({
    customerId: customer.id,
    scope: TermsScope.LOGIN_SIGNUP,
    termsIds,
  });
  if (alreadyRecorded) {
    cookieStore.delete(SIGNUP_TERMS_COOKIE_NAME);
    return;
  }

  // cookie は OAuth 直前の同意集合を保持するが、消費時点の required scope と
  // 乖離している可能性がある (admin publish / scope 変更)。記録前に再 gate する。
  await assertAllRequiredTermsAgreed({
    scope: TermsScope.LOGIN_SIGNUP,
    agreedTermsIds: termsIds,
  });

  const clientIp = await getClientIpFromHeaders();
  const headersList = await headers();
  const userAgent = headersList.get("user-agent");

  // 先に記録を確定 → 成功後に cookie 削除。recordTermsAgreementsCommand 内で throw
  // した場合は cookie を残し、次回訪問時に retry されるようにする
  // (MYPAGE-AUTH-03: transient DB failure からの自動回復)。
  await recordTermsAgreementsCommand({
    termsIds,
    scope: TermsScope.LOGIN_SIGNUP,
    customerId: customer.id,
    ipAddress: clientIp,
    userAgent: userAgent ?? null,
  });

  cookieStore.delete(SIGNUP_TERMS_COOKIE_NAME);
}
