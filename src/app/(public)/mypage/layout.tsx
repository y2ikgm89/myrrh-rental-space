/**
 * /mypage — マイページレイアウト（認証必須）
 *
 * - verifyCustomerSession() で認証チェック
 * - ensureCustomerLinked() で Customer 紐づけ
 * - メール未登録時は /mypage/settings にリダイレクト（LINE ログインで email なしの場合）
 */

import type { ReactNode } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { verifyCustomerSession } from "@/shared/lib/auth";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { Container } from "@/public/components/design-system/container";
import { MypageNav } from "./_components/mypage-nav";

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
  const customer = await ensureCustomerLinked(user);

  // 停止・ブラックリスト顧客はマイページアクセス不可
  if (!customer.isActive) {
    redirect("/login?error=account_suspended");
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
    <section className="py-[var(--spacing-section)]">
      <Container>
        <MypageNav />
        {children}
      </Container>
    </section>
  );
}
