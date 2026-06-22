/**
 * /mypage — マイページレイアウト（認証必須）
 *
 * - verifyCustomerSession() で認証チェック
 * - ensureCustomerLinked() で Customer 紐づけ
 * - 新規顧客の場合、signup terms cookie を消費して同意記録
 * - メール未登録時は /mypage/settings にリダイレクト（LINE ログインで email なしの場合）
 *
 * 設計（rule .claude/rules/db-and-domain.md §6 canonical）:
 * - 認証 + Prisma 直呼び出し (verifyCustomerSession / ensureCustomerLinked) + cookies/headers
 *   等の dynamic API 処理は **MypageAuthGate async SC に隔離**し、冒頭で `await connection()`
 *   を呼んで build prerender skip を保証する。
 * - layout body は `<Suspense fallback={null}><MypageAuthGate>{children}</MypageAuthGate></Suspense>`
 *   のみで構成し、defense-in-depth でルール完全準拠。
 * - Set-Cookie (cookieStore.delete) / redirect() は MypageAuthGate の `await` チェーンが
 *   完了して return する前に実行されるため、Suspense 境界外への副作用流出は起きない
 *   (await 完了 → return JSX → stream 開始 の順序が Next.js / React の公式契約)。
 *
 * 公式背景: https://nextjs.org/docs/app/api-reference/functions/connection
 * 同 pattern: 公開 root layout (PR #696 / project_public-csp-nonce-static-shell-fix-2026-06-22)
 */

import type { ReactElement, ReactNode } from "react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { recordTermsAgreementsCommand } from "@/shared/domain/terms/commands";
import { TERMS_AGREEMENT_CONTEXT } from "@/shared/lib/validations/terms";
import {
  SIGNUP_TERMS_COOKIE_NAME,
  decodeSignupTermsCookie,
} from "@/shared/lib/signup-terms-cookie";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { getClientIpFromHeaders } from "@/shared/lib/rate-limit";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { MypageNav } from "./_components/mypage-nav";
import { IncompleteProfileNotice } from "./_components/incomplete-profile-notice";

export const metadata: Metadata = {
  title: "マイページ",
  robots: { index: false, follow: false },
};

/**
 * MypageAuthGate
 *
 * 認証 + Customer リンク + signup cookie 消費 + LINE メール未登録時 redirect を行う
 * async SC。`await connection()` 冒頭呼び出しで build prerender を構造的に skip し、
 * 全 await 完了 → return JSX の順序で Set-Cookie / redirect の副作用が確実に Suspense
 * 境界外（response stream 開始前）に flush される。
 *
 * rule §6 canonical (`<Suspense>` + `await connection()` の async SC で DB 直呼出を隔離) 準拠。
 */
async function MypageAuthGate({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactElement> {
  await connection();
  const { user } = await verifyCustomerSession();
  const { customer, isNew } = await ensureCustomerLinked(user);

  // 停止・ブラックリスト顧客はマイページアクセス不可
  if (!customer.isActive) {
    redirect("/login?error=account_suspended");
  }

  // 新規顧客の場合、signup 同意 cookie を消費して同意記録
  // Next.js 公式パターン: layout Server Component で cookies() を read/write 可
  const cookieStore = await cookies();
  const signupCookie = cookieStore.get(SIGNUP_TERMS_COOKIE_NAME);
  if (signupCookie) {
    if (isNew) {
      const termsIds = decodeSignupTermsCookie(signupCookie.value);
      if (termsIds.length > 0) {
        const clientIp = await getClientIpFromHeaders();
        const headersList = await headers();
        const userAgent = headersList.get("user-agent");
        fireAndForget(
          recordTermsAgreementsCommand({
            termsIds,
            context: TERMS_AGREEMENT_CONTEXT.SIGNUP,
            customerId: customer.id,
            ipAddress: clientIp,
            userAgent: userAgent ?? null,
          }),
          {
            operation: "recordSignupTermsAgreements",
            category: ErrorCategory.DATABASE,
          },
        );
      }
    }
    // 既存顧客でも cookie をクリーンアップ（再利用防止）
    cookieStore.delete(SIGNUP_TERMS_COOKIE_NAME);
  }

  // LINE メール未登録時: settings 以外のページなら settings にリダイレクト（循環防止）
  if (!customer.email) {
    const headerList = await headers();
    const pathname = headerList.get("x-pathname") ?? "";
    if (!pathname.startsWith("/mypage/settings")) {
      redirect("/mypage/settings?require_email=true");
    }
  }

  return (
    <PageLayout variant="dashboard">
      <MypageNav />
      <IncompleteProfileNotice customer={customer} />
      {children}
    </PageLayout>
  );
}

export default async function MypageLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactElement> {
  // 認証ロジックを MypageAuthGate に隔離し Suspense で包む。
  // - rule §6 canonical (build prerender 汚染回避)
  // - root layout が ƒ 化（PR #696）したので mypage routes は inheritance で ƒ になるが、
  //   defense-in-depth で sub-layout 単位でも明示的に隔離 pattern を適用する。
  return (
    <Suspense fallback={null}>
      <MypageAuthGate>{children}</MypageAuthGate>
    </Suspense>
  );
}
