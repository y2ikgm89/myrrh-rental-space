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
import { sendDeleteAccountVerificationEmail } from "@/shared/lib/email/delete-account-emails";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache";
import { anonymizeCustomerBeforeAuthUserDelete } from "@/shared/domain/customers/account-deletion";
import { logError, ErrorCategory, ErrorSeverity } from "./errors/server";
import { SESSION_CONFIG, CACHE_TAGS, getAppUrl } from "./constants";
import { isRecord } from "./serialize";
import { isDashboardRole } from "./admin-roles";
import { isCustomerE2ELoginEnabled } from "./e2e-runtime";
import { serverEnv } from "./env/server";

// ---------------------------------------------------------------------------
// Better Auth Instance
// ---------------------------------------------------------------------------

const appUrl = serverEnv.BETTER_AUTH_URL ?? getAppUrl();

/**
 * Better Auth `accountLinking.trustedProviders` の SSoT。
 *
 * ここに列挙した provider は、同一 email を持つ既存アカウントに対して
 * email 検証なしで silently auto-link される（Better Auth 公式仕様）。
 * したがって upstream IdP 側で email verification を **強制** している
 * provider のみを列挙する。
 *
 * - `google`: OK。Google は identity-provider 層で email verification を
 *   必須化しているため、Google から取得した email は attacker が任意に
 *   偽装できない。
 * - `line`: **NG（列挙禁止）**。LINE Login は openid + email scope 付与でも
 *   upstream で email 検証を必須化していない（LINE プロフィール登録時に
 *   ユーザーが任意入力した email をそのまま返す）。列挙すると attacker が
 *   victim の email で LINE アカウントを作り初回サインインするだけで
 *   既存 Google 紐付き Customer に silently attach 可能になる。
 *
 * @see https://www.better-auth.com/docs/concepts/users-accounts#account-linking
 */
export const CUSTOMER_TRUSTED_PROVIDERS = ["google"] as const;

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

  // CI E2E (production build + http://localhost) で Better Auth が cookie に
  // `Secure` flag を強制付与すると、HTTPS でない localhost に cookie が set されず
  // session 確立失敗 → /mypage navigation timeout の silent UX bug を引き起こす。
  // `NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` の opt-in 環境でのみ secure cookie を無効化する
  // （staging / production には build env 不在のため絶対伝播しない）。
  const isE2EOptIn = isCustomerE2ELoginEnabled();

  return betterAuth({
    baseURL: appUrl,
    basePath: "/api/customer-auth",
    database: createBetterAuthDatabaseAdapter(),
    advanced: {
      database: {
        generateId: "uuid",
      },
      cookiePrefix: "customer-auth",
      ...(isE2EOptIn && { useSecureCookies: false }),
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
      // 開発環境 + CI E2E opt-in（dev-login-action 用）。
      // staging / production には build env 不在で false 評価される。
      // `=== "development"` を採用して staging の `NODE_ENV=production` 誤検知を防ぐ。
      enabled: serverEnv.NODE_ENV === "development" || isE2EOptIn,
    },
    ...(Object.keys(socialProviders).length > 0 ? { socialProviders } : {}),
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        // CRITIC-1: LINE Login は upstream で email 検証を必須化していないため
        // trustedProviders から除外（詳細は CUSTOMER_TRUSTED_PROVIDERS の docstring）。
        trustedProviders: [...CUSTOMER_TRUSTED_PROVIDERS],
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
        // 顧客は OAuth 専用（パスワード未設定）のため、セッション鮮度チェックのみでの
        // 即時削除は session hijack / XSS / 共有端末で危険（Better Auth 公式 docs
        // "Authentication Requirements" が OAuth ユーザーに明示的にこの callback を推奨）。
        // 設定するだけで deleteUser API は「即時削除」から「確認メール送信」に切り替わる。
        sendDeleteAccountVerification: async ({ user, url }) => {
          // OAUTH-BETTER-AUTH-02: 送信失敗を握りつぶすと Better Auth 側は「削除
          // 申請成功」を返すが、ユーザーは確認メールを受け取れずに zombie 削除
          // 状態に陥る（Better Auth 内部で pending deletion がマークされ、
          // 顧客はメール内リンクを踏めないため deletion を完了できない）。
          // logError で HIGH severity を残しつつ re-throw して deleteUser API 側
          // にエラーを propagate し、UI で「送信に失敗しました」を retryable に
          // 表示させる。
          try {
            await sendDeleteAccountVerificationEmail({
              email: user.email,
              name: user.name,
              deletionUrl: url,
            });
          } catch (error) {
            logError(error, {
              category: ErrorCategory.EXTERNAL_API,
              severity: ErrorSeverity.HIGH,
              context: { operation: "sendDeleteAccountVerification" },
            });
            throw error;
          }
        },
        // 実際の削除は本人がメール内リンクを踏んだ時点（Better Auth 内部の
        // /api/customer-auth/delete-user/callback、Route Handler）で発生する。
        //
        // Clean break (mypage audit): PII は User 削除前に必須で anonymize する。
        // domain SSoT に委譲し、User 物理削除は BA 本体に残す。
        // @see https://www.better-auth.com/docs/concepts/users-accounts
        beforeDelete: async (user) => {
          await anonymizeCustomerBeforeAuthUserDelete(user.id);
        },
        afterDelete: async () => {
          invalidateSiteWideCacheFromRouteHandler([
            CACHE_TAGS.CUSTOMERS,
            CACHE_TAGS.RESERVATIONS,
            CACHE_TAGS.REVIEWS,
            CACHE_TAGS.INQUIRIES,
            CACHE_TAGS.EVENTS,
          ]);
        },
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

export function getCustomerSessionUser(session: unknown): CustomerUser | null {
  if (!isRecord(session)) return null;
  const user = session["user"];
  if (!isValidSessionUser(user)) return null;
  const { role, ...rest } = user;
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
export const verifyCustomerSession = cache(
  async (
    requestHeaders?: Headers,
  ): Promise<{ session: CustomerSession; user: CustomerUser }> => {
    const session = await getCustomerSession(requestHeaders);
    if (!session) redirect("/login");
    const user = getCustomerSessionUser(session);
    if (!user) redirect("/login");
    if (isDashboardRole(user.role)) redirect("/admin");
    return { session, user };
  },
);

/** 現在の顧客ユーザー取得（リダイレクトなし） */
export const getCurrentCustomerUser = cache(
  async (requestHeaders?: Headers): Promise<CustomerUser | null> => {
    const session = await customerAuth.api.getSession({
      headers: await resolveRequestHeaders(requestHeaders),
    });
    return getCustomerSessionUser(session);
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
