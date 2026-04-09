/**
 * 顧客用 Better Auth Client SDK
 *
 * 公開ページのソーシャルログイン・マイページ用。
 * basePath を /api/customer-auth に設定して管理者用と分離。
 *
 * @see https://www.better-auth.com/docs/integrations/next
 */

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { customerAuth } from "./customer-auth";
import { getAppUrl } from "./constants";

export const customerAuthClient = createAuthClient({
  baseURL: getAppUrl(),
  basePath: "/api/customer-auth",
  plugins: [inferAdditionalFields<typeof customerAuth>()],
});

export const {
  signIn,
  signOut,
  useSession,
  getSession,
  linkSocial,
  unlinkAccount,
  deleteUser,
} = customerAuthClient;
