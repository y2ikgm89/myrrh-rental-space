/**
 * Better Auth Client SDK
 *
 * @see https://www.better-auth.com/docs/integrations/next
 *
 * クライアントサイドでの認証操作に使用
 */

import { createAuthClient } from "better-auth/react";
import { getAppUrl } from "./constants";

/**
 * Better Auth クライアントインスタンス
 */
export const authClient = createAuthClient({
  baseURL: getAppUrl(),
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
