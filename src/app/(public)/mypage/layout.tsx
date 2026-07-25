/**
 * /mypage — マイページレイアウト（認証必須）
 *
 * - verifyCustomerSession() で認証チェック
 * - ensureCustomerLinked() で Customer 紐づけ
 * - 新規顧客の場合、signup terms cookie を消費して同意記録（SignupTermsConsumer に隔離）
 * - メール未登録時は /mypage/settings にリダイレクト（LINE ログインで email なしの場合）
 *
 * Feature / maintenance 契約:
 * - maintenance mode は親 `(public)/layout.tsx` の `MaintenanceGate` が適用（本 layout では
 *   重複 gate しない）。mypage も公開 surface の一部としてメンテナンスページに切り替わる。
 * - `/mypage` 予約一覧は reservation Feature Module OFF でも read 可（既存予約の確認・
 *   キャンセル継続の intentional half-gate）。新規予約は `/reservation` の
 *   `requireFeatureEnabled("reservation")` で 404。`/mypage/events` のみ events gate あり。
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
import { isCustomerActiveForMypage } from "@/shared/domain/customers/guard";
import { getReagreeRequiredTermsForCustomer } from "@/shared/domain/terms/queries";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { MypageNav } from "./_components/mypage-nav";
import { hasUnlinkedGuestCustomerForEmail } from "@/shared/domain/customers/queries";
import { IncompleteProfileNotice } from "./_components/incomplete-profile-notice";
import { UnlinkedGuestHistoryNotice } from "./_components/unlinked-guest-history-notice";
import { SignupTermsConsumer } from "./_components/signup-terms-consumer";
import { isReagreeAllowlisted } from "./_lib/reagree-allowlist";

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

  // 停止・BLACKLIST 顧客は mypage アクセス不可（read + write の判定基準を
  // Server Action ガード `assertCustomerActive` と揃えるため、SSoT の
  // `isCustomerActiveForMypage` に委譲する。過去の `!customer.isActive` のみの
  // 判定は `status=BLACKLIST + isActive=true` (bulkSetStatusCustomersCommand が
  // 生成する状態) の顧客に read を素通しさせていた — MYPAGE-AUTH-02）。
  if (!isCustomerActiveForMypage(customer)) {
    redirect("/login?error=account_suspended");
  }

  // pathname は 2 つの gate (email 未登録・LOGIN_SIGNUP 再同意) で共用するため一括取得。
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";

  // LINE メール未登録時: settings 以外のページなら settings にリダイレクト（循環防止）
  if (!customer.email && !pathname.startsWith("/mypage/settings")) {
    redirect("/mypage/settings?require_email=true");
  }

  // LOGIN_SIGNUP scope の必須規約が新版に差し替わっている / 未同意なら reagree ページに強制送致。
  // 「証跡アクセスは agreement 前提外」の原則に従い、read-only 履歴閲覧経路は allowlist で通す
  // (`_lib/reagree-allowlist.ts`)。email 未登録 → settings の gate が優先されるので、settings は
  // allowlist に含めて循環回避する (同じ理由で terms/reagree 本体も allowlist)。
  if (!isReagreeAllowlisted(pathname)) {
    const pending = await getReagreeRequiredTermsForCustomer(customer.id);
    if (pending.length > 0) {
      const returnTo = pathname || "/mypage";
      redirect(
        toAppRoute(
          `/mypage/terms/reagree?returnTo=${encodeURIComponent(returnTo)}`,
        ),
      );
    }
  }

  const [eventsEnabled, contactEnabled, hasUnlinkedGuestHistory] =
    await Promise.all([
      isFeatureEnabled("events"),
      isFeatureEnabled("contact"),
      hasUnlinkedGuestCustomerForEmail({
        email: customer.email,
        excludeCustomerId: customer.id,
      }),
    ]);

  return (
    <PageLayout variant="dashboard">
      <MypageNav
        eventsEnabled={eventsEnabled}
        contactEnabled={contactEnabled}
      />
      <IncompleteProfileNotice customer={customer} />
      <UnlinkedGuestHistoryNotice
        hasUnlinkedGuestHistory={hasUnlinkedGuestHistory}
        showContactLink={contactEnabled}
      />
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
