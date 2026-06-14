"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/shared/lib/admin-auth";
import { DEV_ADMIN_CREDENTIALS } from "./dev-login-credentials";

/**
 * dev 専用 SUPER_ADMIN でのログイン（サインインをサーバー側で完結）。
 *
 * - 認証情報は server-only モジュールに置き、クライアントバンドルに出さない。
 * - サインインは `adminAuth.api.signInEmail` をサーバー側で実行し、
 *   `nextCookies()` プラグインが Set-Cookie を自動処理する（Better Auth 公式パターン）。
 * - 成功時はサーバー側 `redirect("/admin")` でナビゲートする。
 * - SUPER_ADMIN は seed（`prisma/seed.ts`）で作成済みである前提。
 *   `--production` seed では作成されないため本番 DB には存在しない。
 * - 本番では `page.tsx` 側の表示ガードに加え、この early return が二重防御となる。
 *   CI E2E は production build + `NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` opt-in で利用。
 */
export async function devAdminLoginAction(): Promise<{ error: string } | void> {
  if (
    process.env["NODE_ENV"] === "production" &&
    process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"] !== "1"
  ) {
    return { error: "本番環境では利用できません" };
  }

  try {
    await adminAuth.api.signInEmail({
      body: {
        email: DEV_ADMIN_CREDENTIALS.email,
        password: DEV_ADMIN_CREDENTIALS.password,
      },
      headers: await headers(),
    });
  } catch {
    return {
      error:
        "テストログインに失敗しました（seed の SUPER_ADMIN が存在しない可能性があります）",
    };
  }

  redirect("/admin");
}
