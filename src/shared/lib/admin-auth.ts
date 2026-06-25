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
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { createBetterAuthDatabaseAdapter } from "@/shared/db/better-auth-adapter";
import { AuditAction, Role } from "@/shared/lib/validations/enums/prisma-types";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { isValidRole } from "@/shared/lib/validations/enums/guards";
import { isAdminOrHigherRole, isDashboardRole } from "./admin-roles";
import { SESSION_CONFIG, getAppUrl } from "./constants";
import { isRecord, omitUndefined } from "./serialize";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "./errors/server";
import { sendPasswordResetEmail } from "./email/password-reset-emails";
import { clientEnv } from "./env/client";
import { serverEnv } from "./env/server";
import { validateTurnstile } from "./action-helpers";
import { TURNSTILE_ACTIONS, type TurnstileAction } from "./turnstile-actions";

/**
 * Cloudflare Turnstile で保護する Better Auth エンドポイント
 *
 * Better Auth 公式 captcha プラグインと同一の契約（`x-captcha-response` ヘッダー）を
 * before hook で実装する。DB-based な Turnstile secret key 管理（`Settings` テーブル）と
 * 整合させるため、静的な secretKey を要求する公式プラグインではなく hook 実装を採用。
 *
 * @see https://www.better-auth.com/docs/plugins/captcha
 */
const TURNSTILE_PROTECTED_ENDPOINTS: ReadonlyMap<string, TurnstileAction> =
  new Map([
    ["/request-password-reset", TURNSTILE_ACTIONS.admin_password_reset_request],
    ["/reset-password", TURNSTILE_ACTIONS.admin_password_reset],
  ]);

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
  // CI E2E (production build + http://localhost) で Better Auth が cookie に
  // `Secure` flag を強制付与すると、HTTPS でない localhost に cookie が set されず
  // session 確立失敗 → /admin navigation timeout の silent UX bug。
  // `NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` の opt-in 環境でのみ secure cookie を無効化する
  // （staging / production には build env 不在のため絶対伝播しない）。
  const isE2EOptIn = clientEnv.NEXT_PUBLIC_ENABLE_E2E_LOGIN === "1";

  return betterAuth({
    baseURL: appUrl,
    database: createBetterAuthDatabaseAdapter(),
    advanced: {
      cookiePrefix: "admin-auth",
      database: {
        // DB スキーマが @db.Uuid のため、全モデルで UUID を生成
        generateId: "uuid",
      },
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
      before: createAuthMiddleware(async (ctx) => {
        const expectedAction = TURNSTILE_PROTECTED_ENDPOINTS.get(ctx.path);
        if (!expectedAction) return;

        const token = ctx.headers?.get("x-captcha-response") ?? undefined;
        const result = await validateTurnstile({
          token,
          expectedAction,
        });
        if (!result.success) {
          throw new APIError("BAD_REQUEST", { message: result.error });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        // ログイン (成功 / 失敗)
        //
        // Better Auth の after hook は **エラー throw 時にも発火する**
        // (to-auth-endpoints.mjs: APIError を catch して ctx.context.returned に格納)。
        // 成功 (newSession 確立) と失敗 (returned が APIError / status !== "OK") を
        // 対称配線し、LOGIN_SUCCESS / LOGIN_FAILED の双方を記録する
        // (証跡完全性 + brute-force / credential stuffing 試行追跡)。
        if (ctx.path.startsWith("/sign-in")) {
          try {
            if (ctx.context.newSession) {
              const { user } = ctx.context.newSession;
              void logAuthEvent(AuditAction.LOGIN_SUCCESS, user.id, {
                email: user.email,
                provider: "email",
              });
            } else {
              // ログイン失敗 — newSession 不在のときに記録する。
              // email は body から、ip / userAgent はリクエストヘッダから抽出し、
              // 失敗理由は returned (APIError) の message から取得する。
              const body = isRecord(ctx.body) ? ctx.body : {};
              const email =
                typeof body["email"] === "string" ? body["email"] : "unknown";
              const userAgent =
                ctx.headers?.get("user-agent")?.slice(0, 200) ?? "unknown";
              const ip =
                ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
                ctx.headers?.get("x-real-ip") ??
                "unknown";
              const returned: unknown = ctx.context.returned;
              const returnedRecord = isRecord(returned) ? returned : null;
              const status = returnedRecord
                ? typeof returnedRecord["status"] === "string"
                  ? returnedRecord["status"]
                  : null
                : null;
              const reasonRaw = returnedRecord
                ? typeof returnedRecord["message"] === "string"
                  ? returnedRecord["message"]
                  : ""
                : "";
              // status が "OK" の成功レスポンスは LOGIN_SUCCESS 側で扱うため除外
              // (newSession を伴わない 200 OK は通常存在しないが防御的)。
              if (status !== "OK") {
                void logAuthEvent(AuditAction.LOGIN_FAILED, undefined, {
                  email,
                  ip,
                  userAgent,
                  reason: reasonRaw.slice(0, 200),
                  provider: "email",
                });
              }
            }
          } catch {
            // 監査ログ失敗でも認証フローを阻害しない
          }
        }

        // ログアウト
        if (ctx.path.startsWith("/sign-out")) {
          try {
            const session = ctx.context.session;
            if (session) {
              void logAuthEvent(AuditAction.LOGOUT, session.user.id, {
                email: session.user.email,
              });
            }
          } catch {
            // セッション取得失敗でも認証フローを阻害しない
          }
        }

        // パスワードリセット要求（Better Auth 公式パス）
        if (ctx.path === "/request-password-reset") {
          try {
            const body = isRecord(ctx.body) ? ctx.body : {};
            const email =
              typeof body["email"] === "string" ? body["email"] : "unknown";
            void logAuthEvent(AuditAction.PASSWORD_RESET_REQUEST, undefined, {
              email,
            });
          } catch {
            // 監査ログ失敗でも認証フローを阻害しない
          }
        }

        // パスワードリセット (Better Auth 公式パス /reset-password)
        //
        // Better Auth の after hook は **エラー throw 時にも発火する**
        // (to-auth-endpoints.mjs: APIError を catch して context.returned に格納)。
        // 成功 (newSession 確立 / 200 系 returned) と失敗 (returned が APIError) を
        // ctx.context.returned で分岐し、PASSWORD_CHANGE / PASSWORD_RESET_FAILED
        // を対称配線する（証跡完全性 + brute-force 試行追跡）。
        if (ctx.path === "/reset-password") {
          try {
            const newSession = ctx.context.newSession;
            const returned: unknown = ctx.context.returned;
            const returnedRecord = isRecord(returned) ? returned : null;
            const status = returnedRecord
              ? typeof returnedRecord["status"] === "string"
                ? returnedRecord["status"]
                : null
              : null;
            const isError = status !== null && status !== "OK";

            if (newSession && !isError) {
              void logAuthEvent(
                AuditAction.PASSWORD_CHANGE,
                newSession.user.id,
                {
                  method: "reset",
                  email: newSession.user.email,
                },
              );
            } else {
              const reasonRaw = returnedRecord
                ? typeof returnedRecord["message"] === "string"
                  ? returnedRecord["message"]
                  : ""
                : "";
              void logAuthEvent(AuditAction.PASSWORD_RESET_FAILED, undefined, {
                reason: reasonRaw.slice(0, 200),
              });
            }
          } catch {
            // 監査ログ失敗でも認証フローを阻害しない
          }
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

export function getAdminSessionUser(session: unknown): AdminUser | null {
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

/** セッション検証（cache() でリクエスト単位メモ化） */
const verifySession = cache(
  async (requestHeaders?: Headers): Promise<AdminUser> => {
    // 管理者の認可は常にライブ DB のロール / セッションで判定する。
    // cookieCache（maxAge 5 分）を信頼すると、降格（updateUserRole）・アカウント削除・
    // セッション失効が反映されるまで最大 5 分、署名済み cookie 内の古いロールで
    // dashboard / 管理 mutation を通してしまう。`disableCookieCache` で DB を強制参照し、
    // 同時に cookieCache を refresh する（cache() で request 単位 1 回に集約）。
    const session = await adminAuth.api.getSession({
      headers: await resolveRequestHeaders(requestHeaders),
      query: { disableCookieCache: true },
    });
    const user = getAdminSessionUser(session);
    if (!user) {
      redirect("/admin/login");
    }
    return user;
  },
);

/**
 * ダッシュボードアクセス可能なロール（Single Source of Truth は `admin-roles.ts`）
 *
 * 既存 import パス `@/shared/lib/admin-auth` を維持するための再 export。
 * 定義本体は client-safe な `@/shared/lib/admin-roles` にある。
 */
export { DASHBOARD_ROLES } from "./admin-roles";

/** 管理者セッション検証（DASHBOARD_ROLES のみ許可） */
export const verifyAdminSession = cache(
  async (requestHeaders?: Headers): Promise<AdminUser> => {
    const user = await verifySession(requestHeaders);
    if (!isDashboardRole(user.role)) {
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
    // 権限判定（isAdmin 等）に使うため、verifySession と同様にライブ DB を強制参照する。
    const session = await adminAuth.api.getSession({
      headers: await resolveRequestHeaders(requestHeaders),
      query: { disableCookieCache: true },
    });
    return getAdminSessionUser(session) ?? undefined;
  },
);

/** 管理者権限チェック（ADMIN または SUPER_ADMIN） */
export const isAdmin = cache(
  async (requestHeaders?: Headers): Promise<boolean> => {
    const user = await getCurrentAdminUser(requestHeaders);
    return user !== undefined && isAdminOrHigherRole(user.role);
  },
);

/** 管理者セッション取得（キャッシュなし — Server Actions 用） */
export async function getAdminSession(
  requestHeaders?: Headers,
): Promise<AdminSession | null> {
  // Server Actions の認可判定にも使われるためライブ DB を強制参照する。
  return adminAuth.api.getSession({
    headers: await resolveRequestHeaders(requestHeaders),
    query: { disableCookieCache: true },
  });
}
