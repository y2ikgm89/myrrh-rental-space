/**
 * /mypage — マイページレイアウト（認証必須）
 *
 * - verifyCustomerSession() で認証チェック
 * - ensureCustomerLinked() で Customer 紐づけ
 * - 新規顧客の場合、signup terms cookie を消費して同意記録（SignupTermsConsumer に隔離）
 * - メール未登録時は /mypage/settings にリダイレクト（LINE ログインで email なしの場合）
 *
 * 設計（rule .claude/rules/caching.md「build prerender の焼き込み防止」canonical）:
 * - 認証 + Prisma 直呼び出し (verifyCustomerSession / ensureCustomerLinked) + headers
 *   等の dynamic API 処理は **MypageAuthGate async SC に隔離**し、冒頭で `await connection()`
 *   を呼んで build prerender skip を保証する。
 * - layout body は `<Suspense fallback={null}><MypageAuthGate>{children}</MypageAuthGate></Suspense>`
 *   のみで構成し、defense-in-depth でルール完全準拠。
 * - **Cookie mutation (set/delete) は Server Component から呼べない**（Next.js 公式: docs/
 *   01-app/02-guides/data-security.mdx "BAD: Triggering Mutation During Rendering"）。
 *   signup cookie の消費は SignupTermsConsumer (client) → consumeSignupTermsAction (Server
 *   Action) のチェーンに切り出し、cookie 削除を Server Action context で実行する。
 *
 * 公式背景: https://nextjs.org/docs/app/api-reference/functions/connection
 * 同 pattern: 公開 root layout (PR #696 / project_public-csp-nonce-static-shell-fix-2026-06-22)
 */

import type { ReactElement, ReactNode } from "react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { MypageNav } from "./_components/mypage-nav";
import { IncompleteProfileNotice } from "./_components/incomplete-profile-notice";
import { SignupTermsConsumer } from "./_components/signup-terms-consumer";

export const metadata: Metadata = {
  title: "マイページ",
  robots: { index: false, follow: false },
};

/**
 * MypageAuthGate
 *
 * 認証 + Customer リンク + LINE メール未登録時 redirect を行う async SC。
 * `await connection()` 冒頭呼び出しで build prerender を構造的に skip する。
 *
 * Cookie mutation は禁止のため SignupTermsConsumer に委譲（rule §6 + Next.js 公式 canonical）。
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
      <SignupTermsConsumer isNew={isNew} />
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
