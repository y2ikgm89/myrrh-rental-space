/**
 * /mypage — マイページレイアウト（認証必須）
 *
 * - verifyCustomerSession() で認証チェック
 * - ensureCustomerLinked() で Customer 紐づけ
 * - 新規顧客の場合、signup terms cookie を消費して同意記録
 * - メール未登録時は /mypage/settings にリダイレクト（LINE ログインで email なしの場合）
 */

import type { ReactNode } from "react";
import type { Metadata } from "next";
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

export default async function MypageLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const { user } = await verifyCustomerSession();
  const { customer, isNew } = await ensureCustomerLinked(user);

  // 停止・ブラックリスト顧客はマイページアクセス不可
  if (!customer.isActive) {
    redirect("/login?error=account_suspended");
  }

  // 新規顧客の場合、signup 同意 cookie を消費して同意記録
  // Next.js 公式パターン: layout Server Component で cookies() を read/write 可
  const cookieStore = await cookies();
  // eslint-disable-next-line @eslint-react/purity
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
    // eslint-disable-next-line @eslint-react/purity
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
