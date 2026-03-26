/**
 * /mypage — マイページレイアウト（認証必須）
 *
 * - verifyCustomerSession() で認証チェック
 * - ensureCustomerLinked() で Customer 紐づけ
 * - メール未登録時は /mypage/settings にリダイレクト（LINE ログインで email なしの場合）
 */

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { verifyCustomerSession } from "@/shared/lib/auth";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { Container } from "@/public/components/design-system/container";
import { MypageNav } from "./_components/mypage-nav";

export default async function MypageLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const { user } = await verifyCustomerSession();
  const customer = await ensureCustomerLinked(user);

  // LINE メール未登録時: settings 以外のページなら settings にリダイレクト（循環防止）
  if (!customer.email) {
    const headerList = await headers();
    const pathname = headerList.get("x-next-pathname") ?? "";
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
