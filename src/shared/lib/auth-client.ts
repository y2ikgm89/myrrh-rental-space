/**
 * Better Auth Client SDK
 *
 * @see https://www.better-auth.com/docs/integrations/next
 *
 * クライアントサイドでの認証操作に使用
 */

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "./auth";
import { getAppUrl } from "./constants";

/**
 * Better Auth クライアントインスタンス
 *
 * inferAdditionalFields でサーバー側の additionalFields（role 等）を型推論
 */
export const authClient = createAuthClient({
  baseURL: getAppUrl(),
  plugins: [inferAdditionalFields<typeof auth>()],
});

/**
 * 認証フック・メソッドをエクスポート
 */
export const {
  signIn,
  signOut,
  signUp,
  useSession,
  getSession,
  linkSocial,
  unlinkAccount,
  deleteUser,
  $Infer,
} = authClient;
