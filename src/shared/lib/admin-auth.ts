/**
 * Admin Better Auth 設定（管理者専用）
 *
 * 公式推奨パターンに準拠:
 * - better-auth/minimal: Prisma adapter 使用時は Kysely 不要（バンドル削減）
 * - basePrisma: 拡張前の素の PrismaClient を渡す（$extends 済み prisma は使わない）
 * - nextCookies: plugins 配列の末尾に配置（Server Actions の Set-Cookie 対応）
 * - baseURL: サーバー自身の URL を明示設定
 * - cookiePrefix: "admin-auth" で顧客セッションと分離
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
import { AuditAction, Role } from "@generated/prisma/enums";
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

function createAdminAuth() {
  return betterAuth({
    baseURL: appUrl,
    database: createBetterAuthDatabaseAdapter(),
    advanced: {
      cookiePrefix: "admin-auth",
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
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "CUSTOMER",
          input: false,
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path.startsWith("/sign-in") && ctx.context.newSession) {
          const { user } = ctx.context.newSession;
          void logAuthEvent(AuditAction.LOGIN_SUCCESS, user.id, {
            email: user.email,
            provider: "email",
          });
        }
      }),
    },
    trustedOrigins: [appUrl],
    // nextCookies は必ず plugins 配列の末尾（公式推奨）
    plugins: [nextCookies()],
  });
}

type AdminAuthInstance = ReturnType<typeof createAdminAuth>;

export const adminAuth = createAdminAuth();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminSession = AdminAuthInstance["$Infer"]["Session"];

/**
 * Admin Better Auth ユーザー型（role を Role enum に変換）
 *
 * Better Auth の $Infer は additionalFields.role を string で推論するため、
 * Omit + Role enum 再付与で型レベルの整合性を確保する。
 * ランタイムの検証は getAdminSessionUser() / isValidRole() が担う。
 */
export type AdminUser = Omit<AdminSession["user"], "role"> & {
  role: Role;
};

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

function isValidSessionUser(user: unknown): user is AdminSession["user"] {
  if (!isRecord(user)) return false;
  if (!("id" in user) || !("email" in user) || !("role" in user)) return false;
  return typeof user["id"] === "string" && typeof user["email"] === "string";
}

const VALID_ROLES = new Set<string>(Object.values(Role));

export function isValidRole(role: string): role is Role {
  return VALID_ROLES.has(role);
}

export function getAdminSessionUser(
  session: AdminSession | null,
): AdminUser | null {
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

/** セッション検証（cache() でリクエスト単位メモ化） */
const verifySession = cache(
  async (requestHeaders?: Headers): Promise<AdminUser> => {
    const session = await adminAuth.api.getSession({
      headers: await resolveRequestHeaders(requestHeaders),
    });
    const user = getAdminSessionUser(session);
    if (!user) {
      redirect("/admin/login");
    }
    return user;
  },
);

/** ダッシュボードアクセス可能なロール（Single Source of Truth） */
export const DASHBOARD_ROLES: readonly Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.EDITOR,
  Role.VIEWER,
];

/** 管理者セッション検証（DASHBOARD_ROLES のみ許可） */
export const verifyAdminSession = cache(
  async (requestHeaders?: Headers): Promise<AdminUser> => {
    const user = await verifySession(requestHeaders);
    if (!DASHBOARD_ROLES.includes(user.role)) {
      // 非管理者ロール（CUSTOMER/USER）は公開サイトへ
      // /admin/login にリダイレクトすると proxy の Admin Gate で 404 になるか、
      // gate cookie があれば無限リダイレクトループの原因になる
      redirect("/");
    }
    return user;
  },
);

/** 現在の管理者ユーザー取得（リダイレクトなし） */
export const getCurrentAdminUser = cache(
  async (requestHeaders?: Headers): Promise<AdminUser | undefined> => {
    const session = await adminAuth.api.getSession({
      headers: await resolveRequestHeaders(requestHeaders),
    });
    return getAdminSessionUser(session) ?? undefined;
  },
);

/** 管理者権限チェック */
export const isAdmin = cache(
  async (requestHeaders?: Headers): Promise<boolean> => {
    const user = await getCurrentAdminUser(requestHeaders);
    return user?.role === Role.ADMIN || user?.role === Role.SUPER_ADMIN;
  },
);

/** 管理者セッション取得（キャッシュなし — Server Actions 用） */
export async function getAdminSession(
  requestHeaders?: Headers,
): Promise<AdminSession | null> {
  return adminAuth.api.getSession({
    headers: await resolveRequestHeaders(requestHeaders),
  });
}
