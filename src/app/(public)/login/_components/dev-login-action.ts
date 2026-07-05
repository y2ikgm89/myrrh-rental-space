"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { customerAuth } from "@/shared/lib/customer-auth";
import { isCustomerE2ELoginEnabled } from "@/shared/lib/e2e-runtime";
import { DEV_CUSTOMER_CREDENTIALS } from "./dev-login-credentials";

/**
 * dev 専用テスト顧客でのログイン（ユーザー作成 + サインインをサーバー側で完結）。
 *
 * - 認証情報は server-only モジュールに置き、クライアントバンドルに出さない。
 * - サインインは `customerAuth.api.signInEmail` をサーバー側で実行し、
 *   `nextCookies()` プラグインが Set-Cookie を自動処理する（Better Auth 公式パターン）。
 * - 成功時はサーバー側 `redirect("/mypage")` でナビゲートする。
 * - CI E2E は production build + `NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` opt-in で利用。
 *   staging / production には build env 不在のため絶対伝播しない（build env 限定）。
 */
export async function devCustomerLoginAction(): Promise<{
  error: string;
} | void> {
  if (
    process.env["NODE_ENV"] === "production" &&
    !isCustomerE2ELoginEnabled()
  ) {
    return { error: "本番環境では利用できません" };
  }

  const reqHeaders = await headers();

  // 1. テストユーザーの存在確認 + 作成（idempotent）
  try {
    await customerAuth.api.signUpEmail({
      body: {
        email: DEV_CUSTOMER_CREDENTIALS.email,
        password: DEV_CUSTOMER_CREDENTIALS.password,
        name: DEV_CUSTOMER_CREDENTIALS.name,
      },
      headers: reqHeaders,
    });
  } catch {
    // ユーザー既存の場合は 400 で throw されるので無視（idempotent）
  }

  // 2. サーバー側サインイン（nextCookies が Set-Cookie を自動処理）
  try {
    await customerAuth.api.signInEmail({
      body: {
        email: DEV_CUSTOMER_CREDENTIALS.email,
        password: DEV_CUSTOMER_CREDENTIALS.password,
      },
      headers: reqHeaders,
    });
  } catch {
    return { error: "テストログインに失敗しました" };
  }

  redirect("/mypage");
}
