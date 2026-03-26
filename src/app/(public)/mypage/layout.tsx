/**
 * /mypage — マイページレイアウト（認証必須）
 *
 * - verifyCustomerSession() で認証チェック
 * - ensureCustomerLinked() で Customer 紐づけ
 *
 * NOTE: メール未登録チェックは各ページで実施（設定ページとの循環リダイレクト防止）
 */

import type { ReactNode } from "react";
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
  await ensureCustomerLinked(user);

  return (
    <section className="py-[var(--spacing-section)]">
      <Container>
        <MypageNav />
        {children}
      </Container>
    </section>
  );
}
