/**
 * Better Auth 設定
 *
 * 公式推奨パターンに準拠:
 * - better-auth/minimal: Prisma adapter 使用時は Kysely 不要（バンドル削減）
 * - prismaForBetterAuth: 拡張前の素の PrismaClient を渡す
 * - nextCookies: plugins 配列の末尾に配置（Server Actions の Set-Cookie 対応）
 * - baseURL: サーバー自身の URL を明示設定
 *
 * @see https://www.better-auth.com/docs
 * @see https://www.better-auth.com/docs/guides/optimizing-for-performance
 * @see https://www.better-auth.com/docs/integrations/next
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
import { sendPasswordResetEmail } from "./email/password-reset-emails";
import { serverEnv } from "./env/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 監査ログを記録（非同期、失敗無視） */
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
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: "createAuthAuditLog", action, userId },
    });
  }
}

// ---------------------------------------------------------------------------
// Better Auth Instance
// ---------------------------------------------------------------------------

const appUrl = serverEnv.BETTER_AUTH_URL ?? getAppUrl();

function createAuth() {
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
    database: createBetterAuthDatabaseAdapter(),
    advanced: {
      database: {
        // DB スキーマが @db.Uuid のため、全モデルで UUID を生成
        generateId: "uuid",
      },
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
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail({
          email: user.email,
          name: user.name,
          resetUrl: url,
        });
      },
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
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path.startsWith("/sign-in") && ctx.context.newSession) {
          const { user } = ctx.context.newSession;
          void logAuthEvent(AuditAction.LOGIN_SUCCESS, user.id, {
            email: user.email,
            provider: ctx.path.includes("/line")
              ? "line"
              : ctx.path.includes("social")
                ? "google"
                : "email",
          });
        }
      }),
    },
    trustedOrigins: [appUrl],
    // nextCookies は必ず plugins 配列の末尾（公式推奨）
    plugins: [nextCookies()],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;

export const auth = createAuth();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Session = AuthInstance["$Infer"]["Session"];

/**
 * Better Auth のユーザー型（role を Role enum に変換）
 *
 * Better Auth の additionalFields は string 型で返されるため、
 * role を Role enum に変換したカスタム型を使用。
 */
export type User = Omit<Session["user"], "role"> & {
  role: Role;
};

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

function isValidSessionUser(user: unknown): user is Session["user"] {
  if (!isRecord(user)) return false;
  if (!("id" in user) || !("email" in user) || !("role" in user)) return false;
  return typeof user["id"] === "string" && typeof user["email"] === "string";
}

const VALID_ROLES = new Set<string>(Object.values(Role));

export function isValidRole(role: string): role is Role {
  return VALID_ROLES.has(role);
}

export function getRoleFromSession(session: Session | null): Role | null {
  if (!session?.user?.role) return null;
  return isValidRole(session.user.role) ? session.user.role : null;
}

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

// ---------------------------------------------------------------------------
// Session Verification (Data Access Layer)
// ---------------------------------------------------------------------------

async function resolveRequestHeaders(
  requestHeaders?: Headers,
): Promise<Headers> {
  return requestHeaders ?? (await headers());
}

/** セッション検証（cache() でリクエスト単位メモ化） */
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

/** 管理者セッション検証（ADMIN / SUPER_ADMIN / EDITOR / VIEWER） */
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

/** 現在のユーザー取得（リダイレクトなし） */
export const getCurrentUser = cache(
  async (requestHeaders?: Headers): Promise<User | undefined> => {
    const session = await auth.api.getSession({
      headers: await resolveRequestHeaders(requestHeaders),
    });
    return getSessionUser(session) ?? undefined;
  },
);

/** 管理者権限チェック */
export const isAdmin = cache(
  async (requestHeaders?: Headers): Promise<boolean> => {
    const user = await getCurrentUser(requestHeaders);
    return user?.role === Role.ADMIN || user?.role === Role.SUPER_ADMIN;
  },
);

/** 顧客セッション検証（管理者ロールはリダイレクト） */
const ADMIN_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.EDITOR,
  Role.VIEWER,
];

export async function verifyCustomerSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = getSessionUser(session);
  if (!user) redirect("/login");
  if (ADMIN_ROLES.includes(user.role)) redirect("/admin");
  return { session, user };
}

/** セッション取得（キャッシュなし — Server Actions 用） */
export async function getSession(
  requestHeaders?: Headers,
): Promise<Session | null> {
  return auth.api.getSession({
    headers: await resolveRequestHeaders(requestHeaders),
  });
}
