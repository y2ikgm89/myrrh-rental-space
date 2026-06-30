/**
 * 管理画面ログインページ
 *
 * Swiss Industrial Admin テーマ
 * - サイドバーと一貫性のあるダークパネル
 * - Trust Blue アクセント
 *
 * 本番の入口制御は Cloud Run IAP が担当する。公開 service では proxy.ts が
 * /admin/* を 404 にするため、このページは admin service 側でのみ表示される。
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAdminSession, getAdminSessionUser } from "@/shared/lib/admin-auth";
import { isDashboardRole } from "@/shared/lib/admin-roles";
import { LoginForm } from "./LoginForm";
import { CopyrightYear } from "./CopyrightYear";
import { DevLoginButton } from "./DevLoginButton";
import type { ReactElement } from "react";

export const metadata: Metadata = {
  title: "ログイン | 管理画面",
};

export default async function LoginPage(): Promise<ReactElement> {
  // PPR(cacheComponents) + strict-dynamic CSP では、静的シェルのスクリプトに
  // nonce が付かず CSP で全ブロックされ、クライアント JS が一切起動しない。
  // 公開ページ・ダッシュボードと同様に connection() で完全動的化し、毎リクエストの
  // nonce を全 script に付与する（リポジトリ全ページ共通の規約）。
  await connection();

  const session = await getAdminSession();
  const user = getAdminSessionUser(session);

  if (session?.user) {
    if (user && isDashboardRole(user.role)) {
      // 管理者ロールでログイン済み → ダッシュボードへ
      redirect("/admin");
    }
    // 非管理者ロール（CUSTOMER/USER）→ 公開サイトへ
    // ログインフォームを見せず、ダッシュボードとの無限リダイレクトも防止
    redirect("/");
  }

  return (
    <div className="min-h-dvh flex">
      {/* 左パネル: ブランディング（サイドバーと同じダークテーマ） */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar-bg relative overflow-hidden">
        {/* 装飾的なグリッドパターン */}
        <div className="absolute inset-0 opacity-[0.03]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(var(--color-sidebar-text) 1px, transparent 1px),
                               linear-gradient(90deg, var(--color-sidebar-text) 1px, transparent 1px)`,
              backgroundSize: "48px 48px",
            }}
          />
        </div>

        {/* コンテンツ */}
        <div className="relative z-10 flex flex-col justify-center px-12 lg:px-16">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-primary mb-6">
              <svg
                className="w-6 h-6 text-primary-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-semibold text-sidebar-text tracking-tight">
              Myrrh Rental Space
            </h1>
            <p className="mt-3 text-sidebar-text-muted text-lg">
              レンタルスペース管理システム
            </p>
          </div>

          {/* フィーチャーリスト */}
          <div className="space-y-4 text-sidebar-text-muted">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>予約・顧客管理</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>スペース・料金設定</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>コンテンツ管理</span>
            </div>
          </div>
        </div>

        {/* 右下の装飾 */}
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-primary/5 rounded-tl-full" />
      </div>

      {/* 右パネル: ログインフォーム */}
      <div className="flex-1 flex items-center justify-center bg-background p-6 sm:p-8">
        <div className="w-full max-w-sm">
          {/* モバイル用ロゴ */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-primary mb-4">
              <svg
                className="w-6 h-6 text-primary-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              管理画面
            </h1>
          </div>

          {/* フォームカード */}
          <div className="bg-card rounded-md border shadow-sm p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                ログイン
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                アカウント情報を入力してください
              </p>
            </div>
            <LoginForm />
            {(process.env["NODE_ENV"] !== "production" ||
              process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"] === "1") && (
              <DevLoginButton />
            )}
          </div>

          {/* フッター */}
          <CopyrightYear />
        </div>
      </div>
    </div>
  );
}
