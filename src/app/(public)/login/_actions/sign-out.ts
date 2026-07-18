"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { customerAuth } from "@/shared/lib/customer-auth";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

/**
 * サスペンド (Customer.isActive=false) 顧客が /login?error=account_suspended 画面から
 * 手動でサインアウトするための Server Action (MYPAGE-AUTH-01)。
 *
 * ## 背景
 * `MypageAuthGate` (Server Component) は Customer.isActive=false を検知すると
 * `redirect('/login?error=account_suspended')` を投げるが、Better Auth のセッション
 * cookie 破棄 (mutation) は Server Component からは実行できない (Next.js 公式禁止)。
 * このため LoginPage 側でユーザーが明示的にログアウトできる経路を用意する必要がある。
 *
 * ## 動作
 * `customerAuth.api.signOut` を実行し、Better Auth の `nextCookies()` プラグインが
 * Set-Cookie で customer-auth session を破棄する。エラーは HIGH severity で記録し、
 * cookie 破棄が完了しなかった場合でも UI 側で無限ループが発生しないよう最終的に
 * `/login` にリダイレクトして LoginPage を素の状態で再描画させる。
 *
 * ## セキュリティ
 * - サインアウトは副作用的にも冪等 (cookie 削除はエラーなし)
 * - CSRF は Better Auth 側で Origin 検証 + POST 強制
 * - Rate limit は不要 (session 破棄は攻撃対象になりにくく、公開ページの認証必須動作)
 *
 * @see https://www.better-auth.com/docs/plugins/next-cookies
 */
export async function signOutCustomerAction(): Promise<void> {
  const reqHeaders = await headers();
  try {
    await customerAuth.api.signOut({ headers: reqHeaders });
  } catch (error) {
    // signOut は idempotent なので通常 throw しないが、DB 障害等で失敗した際は
    // HIGH で記録しつつ redirect を継続させる (無限ループ回避優先)。
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "signOutCustomerAction" },
    });
  }
  redirect("/login");
}
