/**
 * Admin Better Auth Client SDK（管理者専用）
 *
 * @see https://www.better-auth.com/docs/integrations/next
 *
 * 管理画面クライアントサイドでの認証操作に使用
 */

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { adminAuth } from "./admin-auth";

/**
 * Admin Better Auth クライアントインスタンス
 *
 * baseURL は同一オリジン運用では Better Auth 公式どおり省略する。
 * public/admin Cloud Run service で同じ image を使っても、管理ログインは
 * 現在の admin service の `/api/auth` に送られる。
 *
 * inferAdditionalFields でサーバー側の additionalFields（role 等）を型推論
 */
export const adminAuthClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof adminAuth>()],
});

/**
 * 管理者認証フック・メソッドをエクスポート
 */
export const { signIn, signOut, signUp, useSession, getSession } =
  adminAuthClient;
