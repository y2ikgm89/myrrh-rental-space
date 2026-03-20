/**
 * Better Auth 設定
 *
 * Better Authを使用した認証・セッション管理の設定と
 * セッション検証ユーティリティを提供します。
 *
 * ## 機能
 * - **Prisma Adapter**: データベース連携
 * - **30日間セッション**: 自動更新対応
 * - **複数認証方式**: Email/Password、Google OAuth
 * - **監査ログ**: ログイン成功/失敗の自動記録
 *
 * ## 静的初期化パターン
 * Better Auth の公式推奨に合わせ、auth インスタンスはモジュールロード時に
 * env ベースで同期的に 1 回だけ初期化する。
 *
 * Google OAuth provider 設定も env / Secret Manager を正本とし、
 * 管理画面からの動的上書きは持たない。
 *
 * @see https://www.better-auth.com/docs
 * @module shared/lib/auth
 */

import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { createBetterAuthDatabaseAdapter } from "@/shared/db/better-auth-adapter";
import { AuditAction, Role } from "@/shared/db/enums";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { SESSION_CONFIG, getAppUrl } from "./constants";
import { isRecord, omitUndefined } from "./serialize";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "./errors/server";
import { serverEnv } from "./env/server";

/**
 * 監査ログを記録（非同期、失敗無視）
 */
async function logAuthEvent(
  action: AuditAction,
  userId: string | undefined,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await createAuditLogRecord(
      omitUndefined({
        userId,
        action,
        resource: "auth",
        metadata,
      }),
    );
  } catch (error) {
    // ログ記録失敗は無視（本番ではSentry等に送信推奨）
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: "createAuthAuditLog", action, userId },
    });
  }
}

/**
 * Better Auth インスタンス作成関数
 */
function createAuth() {
  const googleClientId = serverEnv.GOOGLE_CLIENT_ID;
  const googleClientSecret = serverEnv.GOOGLE_CLIENT_SECRET;
  const socialProviders =
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            scope: [
              "openid",
              "email",
              "profile",
              "https://www.googleapis.com/auth/calendar.events",
            ],
          },
        }
      : undefined;

  return betterAuth({
    /**
     * Prisma では 1.4.0 以降、ネイティブ join がサポートされている。
     * /get-session 等で session + user を一度に取り、無効なネスト select を避ける。
     * @see https://www.better-auth.com/docs/adapters/prisma#joins-experimental
     */
    experimental: {
      joins: true,
    },
    database: createBetterAuthDatabaseAdapter(),
    session: {
      expiresIn: SESSION_CONFIG.expiresIn,
      updateAge: SESSION_CONFIG.updateAge,
      cookieCache: {
        enabled: true,
        maxAge: SESSION_CONFIG.cookieCacheMaxAge,
      },
    },
    emailAndPassword: {
      enabled: true,
    },
    ...(socialProviders ? { socialProviders } : {}),
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: Role.USER,
          input: false,
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        // ログイン成功時の監査ログ
        if (ctx.path.startsWith("/sign-in") && ctx.context.newSession) {
          const { user } = ctx.context.newSession;
          void logAuthEvent(AuditAction.LOGIN_SUCCESS, user.id, {
            email: user.email,
            provider: ctx.path.includes("social") ? "google" : "email",
          });
        }
      }),
    },
    plugins: [nextCookies()],
    trustedOrigins: [serverEnv.BETTER_AUTH_URL ?? getAppUrl()],
  });
}

/**
 * Better Auth インスタンスの型（インスタンス生成なしで型推論）
 *
 * `ReturnType<typeof createAuth>` で関数の戻り値型を取得し、
 * indexed access type で `$Infer` にアクセス。
 * モジュールロード時の不要な副作用（DB接続等）を回避。
 */
type AuthInstance = ReturnType<typeof createAuth>;

export const auth = createAuth();

/**
 * セッション型
 */
export type Session = AuthInstance["$Infer"]["Session"];

/**
 * Better Auth のユーザー型（role を Role enum に変換）
 *
 * Better Auth の additionalFields は string 型で定義されるため、
 * 内部で Role enum にキャストしたカスタム型を使用
 */
export type User = Omit<Session["user"], "role"> & {
  role: Role;
};

/**
 * セッションユーザー型ガード
 *
 * Better Authのセッションからユーザーを型安全に取得
 */
function isValidSessionUser(user: unknown): user is Session["user"] {
  if (!isRecord(user)) return false;
  if (!("id" in user) || !("email" in user) || !("role" in user)) return false;
  return typeof user["id"] === "string" && typeof user["email"] === "string";
}

/**
 * 有効なRoleのSet（O(1) lookup用）
 */
const VALID_ROLES = new Set<string>(Object.values(Role));

/**
 * role が有効な Role enum 値か検証
 */
export function isValidRole(role: string): role is Role {
  return VALID_ROLES.has(role);
}

/**
 * セッションからRoleを型安全に取得
 *
 * Server Actionsなどで session.user.role を直接使用する場合のヘルパー
 */
export function getRoleFromSession(session: Session | null): Role | null {
  if (!session?.user?.role) return null;
  return isValidRole(session.user.role) ? session.user.role : null;
}

/**
 * セッションからユーザーを取得（型安全）
 *
 * Better Auth の string 型 role を Role enum にキャストして返す
 */
export function getSessionUser(session: Session | null): User | null {
  if (!session?.user || !isValidSessionUser(session.user)) {
    return null;
  }
  const { role, ...rest } = session.user;
  if (!isValidRole(role)) {
    return null;
  }
  return { ...rest, role };
}

async function resolveRequestHeaders(
  requestHeaders?: Headers,
): Promise<Headers> {
  if (requestHeaders) {
    return requestHeaders;
  }

  return await headers();
}

/**
 * セッション検証（cache()でリクエスト単位でメモ化）
 *
 * Next.js公式ベストプラクティス: Data Access Layer (DAL) パターン
 */
export const verifySession = cache(
  async (requestHeaders?: Headers): Promise<User> => {
    const session = await auth.api.getSession({
      headers: await resolveRequestHeaders(requestHeaders),
    });
    const user = getSessionUser(session);
    if (!user) {
      redirect("/admin/login");
    }
    return user;
  },
);

/**
 * 管理者セッション検証（cache()でメモ化）
 *
 * ADMIN と SUPER_ADMIN の両方を管理者として扱う。
 * SUPER_ADMIN は全権限を持つため ADMIN と同等以上のアクセスを許可する。
 */
export const verifyAdminSession = cache(
  async (requestHeaders?: Headers): Promise<User> => {
    const user = await verifySession(requestHeaders);
    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SUPER_ADMIN &&
      user.role !== Role.EDITOR &&
      user.role !== Role.VIEWER
    ) {
      redirect("/admin/login");
    }
    return user;
  },
);

/**
 * 現在のユーザーを取得（cache()でメモ化）
 *
 * リダイレクトなし版（オプショナル認証用）
 */
export const getCurrentUser = cache(
  async (requestHeaders?: Headers): Promise<User | undefined> => {
    const session = await auth.api.getSession({
      headers: await resolveRequestHeaders(requestHeaders),
    });
    return getSessionUser(session) ?? undefined;
  },
);

/**
 * 管理者権限チェック（cache()でメモ化）
 *
 * ADMIN と SUPER_ADMIN の両方を管理者として扱う。
 */
export const isAdmin = cache(
  async (requestHeaders?: Headers): Promise<boolean> => {
    const user = await getCurrentUser(requestHeaders);
    return user?.role === Role.ADMIN || user?.role === Role.SUPER_ADMIN;
  },
);

/**
 * セッション取得（キャッシュなし）
 *
 * Server Actions など cache() が適さない場所で使用
 */
export async function getSession(
  requestHeaders?: Headers,
): Promise<Session | null> {
  return auth.api.getSession({
    headers: await resolveRequestHeaders(requestHeaders),
  });
}
