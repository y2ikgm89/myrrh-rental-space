"use server";

import { headers } from "next/headers";
import { auth } from "@/shared/lib/auth";

const DEV_EMAIL = "dev-customer@example.com";
const DEV_PASSWORD = "dev-password-12345";
const DEV_NAME = "開発テスト";

export async function devLoginAction(): Promise<
  { success: true } | { success: false; error: string }
> {
  if (process.env["NODE_ENV"] === "production") {
    return { success: false, error: "本番環境では利用できません" };
  }

  const reqHeaders = await headers();

  // ユーザーが存在しなければ作成
  const existingUser = await auth.api.getSession({ headers: reqHeaders });
  if (!existingUser) {
    try {
      await auth.api.signUpEmail({
        body: { email: DEV_EMAIL, password: DEV_PASSWORD, name: DEV_NAME },
        headers: reqHeaders,
      });
    } catch {
      // ユーザー既存の場合は無視
    }
  }

  // サインイン
  try {
    await auth.api.signInEmail({
      body: { email: DEV_EMAIL, password: DEV_PASSWORD },
      headers: reqHeaders,
    });
  } catch {
    return { success: false, error: "テストログインに失敗しました" };
  }

  return { success: true };
}
