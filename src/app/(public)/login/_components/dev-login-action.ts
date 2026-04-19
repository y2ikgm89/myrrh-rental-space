"use server";

import { headers } from "next/headers";
import { customerAuth } from "@/shared/lib/customer-auth";
import { DEV_CUSTOMER_CREDENTIALS } from "./dev-login-credentials";

/**
 * dev テストユーザーの存在確認と作成のみ担当する Server Action。
 * サインイン自体は Better Auth 公式推奨パターンに従い Client `signIn.email` で実施
 * （Router Cache + Set-Cookie の自動 invalidation を Next.js 統合に委ねるため）。
 */
export async function ensureDevUserAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  if (process.env["NODE_ENV"] === "production") {
    return { success: false, error: "本番環境では利用できません" };
  }

  const reqHeaders = await headers();
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
  return { success: true };
}
