/**
 * 顧客用 Better Auth 設定
 *
 * 公開ページ（マイページ・ソーシャルログイン）専用。
 * 管理画面とは Cookie prefix / basePath で完全分離。
 *
 * @see https://www.better-auth.com/docs
 */

import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { createBetterAuthDatabaseAdapter } from "@/shared/db/better-auth-adapter";
import type { Role } from "@/shared/lib/validations/enums/prisma-types";
import { isValidRole } from "@/shared/lib/validations/enums/guards";
import { SESSION_CONFIG, getAppUrl } from "./constants";
import { isRecord } from "./serialize";
import { isDashboardRole } from "./admin-roles";
import { serverEnv } from "./env/server";

// ---------------------------------------------------------------------------
// Better Auth Instance
// ---------------------------------------------------------------------------

const appUrl = serverEnv.BETTER_AUTH_URL ?? getAppUrl();

function createCustomerAuth() {
  const googleClientId = serverEnv.GOOGLE_CLIENT_ID;
  const googleClientSecret = serverEnv.GOOGLE_CLIENT_SECRET;
  const lineClientId = serverEnv.LINE_CLIENT_ID;
  const lineClientSecret = serverEnv.LINE_CLIENT_SECRET;

  const socialProviders = {
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            scope: ["openid", "email", "profile"],
          },
        }
      : {}),
    ...(lineClientId && lineClientSecret
      ? {
          line: {
            clientId: lineClientId,
            clientSecret: lineClientSecret,
            scope: ["openid", "profile", "email"],
          },
        }
      : {}),
  };

  return betterAuth({
    baseURL: appUrl,
    basePath: "/api/customer-auth",
    database: createBetterAuthDatabaseAdapter(),
    advanced: {
      database: {
        generateId: "uuid",
      },
      cookiePrefix: "customer-auth",
    },
    session: {
      expiresIn: SESSION_CONFIG.expiresIn,
      updateAge: SESSION_CONFIG.updateAge,
      cookieCache: {
        enabled: true,
        maxAge: SESSION_CONFIG.cookieCacheMaxAge,
      },
    },
    emailAndPassword: {
      // 開発環境のみ有効（dev-login-action 用）
      enabled: serverEnv.NODE_ENV !== "production",
    },
    ...(Object.keys(socialProviders).length > 0 ? { socialProviders } : {}),
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "line"],
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "CUSTOMER",
          input: false,
        },
      },
      deleteUser: {
        enabled: true,
      },
    },
    trustedOrigins: [appUrl],
    plugins: [nextCookies()],
  });
}

type CustomerAuthInstance = ReturnType<typeof createCustomerAuth>;

export const customerAuth = createCustomerAuth();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CustomerSession = CustomerAuthInstance["$Infer"]["Session"];

export type CustomerUser = Omit<CustomerSession["user"], "role"> & {
  role: Role;
};

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

function isValidSessionUser(user: unknown): user is CustomerSession["user"] {
  if (!isRecord(user)) return false;
  if (!("id" in user) || !("email" in user) || !("role" in user)) return false;
  return typeof user["id"] === "string" && typeof user["email"] === "string";
}

export function getCustomerSessionUser(
  session: CustomerSession | null,
): CustomerUser | null {
  if (!session?.user || !isValidSessionUser(session.user)) return null;
  const { role, ...rest } = session.user;
  if (!isValidRole(role)) return null;
  return { ...rest, role };
}

// ---------------------------------------------------------------------------
// Session Verification (Data Access Layer)
// ---------------------------------------------------------------------------

async function resolveRequestHeaders(
  requestHeaders?: Headers,
): Promise<Headers> {
  return requestHeaders ?? (await headers());
}

/** 顧客セッション検証（管理者ロールはリダイレクト） */
export async function verifyCustomerSession() {
  const session = await getCustomerSession();
  if (!session) redirect("/login");
  const user = getCustomerSessionUser(session);
  if (!user) redirect("/login");
  if (isDashboardRole(user.role)) redirect("/admin");
  return { session, user };
}

/** 現在の顧客ユーザー取得（リダイレクトなし） */
export const getCurrentCustomerUser = cache(
  async (requestHeaders?: Headers): Promise<CustomerUser | undefined> => {
    const session = await customerAuth.api.getSession({
      headers: await resolveRequestHeaders(requestHeaders),
    });
    return getCustomerSessionUser(session) ?? undefined;
  },
);

/** 顧客セッション取得（キャッシュなし — Server Actions 用） */
export async function getCustomerSession(
  requestHeaders?: Headers,
): Promise<CustomerSession | null> {
  return customerAuth.api.getSession({
    headers: await resolveRequestHeaders(requestHeaders),
  });
}
