/**
 * /mypage — マイページレイアウト（認証必須）
 *
 * - verifyCustomerSession() で認証チェック
 * - ensureCustomerLinked() で Customer 紐づけ
 * - メール未登録の場合は設定ページへリダイレクト
 */

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
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

  if (!customer.email) {
    redirect("/mypage/settings?require_email=true");
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
