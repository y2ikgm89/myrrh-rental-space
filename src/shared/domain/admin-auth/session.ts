import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  recordAdminLoginFailed,
  recordAdminLoginSuccess,
  type AdminAuthAuditIdentity,
} from "@/shared/domain/admin-auth/audit";
import {
  findAdminAuthUserByEmail,
  findOrSyncAdminAuthUserByEmail,
  type AdminAuthUser,
} from "@/shared/domain/admin-auth/queries";
import {
  E2E_ADMIN_IDENTITY_HEADER,
  resolveE2EAdminIdentityEmail,
} from "@/shared/domain/admin-auth/e2e-identity";
import { resolveIapIdentity } from "@/shared/lib/iap/admin-iap-auth";
import { isAdminOrHigherRole, isDashboardRole } from "@/shared/lib/admin-roles";
import { isLocalProductionE2EEnv } from "@/shared/lib/e2e-runtime";
import { serverEnv } from "@/shared/lib/env/server";
import { isLoopbackRequestHost } from "@/shared/lib/request-host";
import { isRecord } from "@/shared/lib/serialize";
import { isValidRole } from "@/shared/lib/validations/enums/guards";

export type { AdminAuthUser };

export type AdminSession = {
  user: AdminAuthUser;
};

async function resolveRequestHeaders(
  requestHeaders?: Headers,
): Promise<Headers> {
  return requestHeaders ?? (await headers());
}

function getTestIapEmail(requestHeaders: Headers): string | null {
  // 非 production も含め、Host が loopback でない限り test-IAP は使わない
  // （staging preview 等で ADMIN_TEST_IAP_EMAIL が効くのを防ぐ）。
  if (!isLoopbackRequestHost(requestHeaders)) return null;
  const isProductionRuntime = serverEnv.NODE_ENV === "production";
  if (isProductionRuntime && !isLocalProductionE2EEnv()) return null;

  // E2E 専用の追加 identity（`x-e2e-admin-identity: viewer` 等）。
  // 既定経路より 1 段厳しく E2E_RUNTIME=1 を要求し、未知ラベルは既定へ
  // fallback せず null を返す（fail-closed）。詳細は e2e-identity.ts。
  const identityLabel = requestHeaders.get(E2E_ADMIN_IDENTITY_HEADER);
  if (identityLabel !== null) {
    if (serverEnv.E2E_RUNTIME !== "1") return null;
    return resolveE2EAdminIdentityEmail(identityLabel);
  }

  return serverEnv.ADMIN_TEST_IAP_EMAIL ?? null;
}

async function resolveAdminEmail(requestHeaders?: Headers): Promise<{
  identity: AdminAuthAuditIdentity;
  requestHeaders: Headers;
} | null> {
  const requestHeaderList = await resolveRequestHeaders(requestHeaders);

  try {
    const identity = await resolveIapIdentity(requestHeaderList);
    if (identity) {
      return {
        identity: {
          email: identity.email,
          provider: "google-iap",
          subject: identity.subject,
        },
        requestHeaders: requestHeaderList,
      };
    }
  } catch {
    await recordAdminLoginFailed({
      reason: "iap_assertion_invalid",
      requestHeaders: requestHeaderList,
      identity: {
        email: "unknown",
        provider: "google-iap",
      },
    });
    return null;
  }

  const testEmail = getTestIapEmail(requestHeaderList);
  if (!testEmail) return null;
  return {
    identity: {
      email: testEmail,
      provider: "test-iap",
    },
    requestHeaders: requestHeaderList,
  };
}

const loadAdminUserByEmail = cache(findOrSyncAdminAuthUserByEmail);
const loadTestAdminUserByEmail = cache(findAdminAuthUserByEmail);

function coerceAdminUser(user: unknown): AdminAuthUser | null {
  if (!isRecord(user)) return null;
  const { id, email, name, image, role, emailVerified } = user;
  if (
    typeof id !== "string" ||
    typeof email !== "string" ||
    !isValidRole(role)
  ) {
    return null;
  }

  return {
    id,
    email,
    name: typeof name === "string" ? name : "",
    image: typeof image === "string" ? image : null,
    role,
    emailVerified: emailVerified === true,
  };
}

export function getAdminSessionUser(session: unknown): AdminAuthUser | null {
  if (!isRecord(session)) return null;
  return coerceAdminUser(session["user"]);
}

export async function getCurrentAdminUser(
  requestHeaders?: Headers,
): Promise<AdminAuthUser | null> {
  const resolved = await resolveAdminEmail(requestHeaders);
  if (!resolved) return null;

  const user =
    resolved.identity.provider === "test-iap"
      ? await loadTestAdminUserByEmail(resolved.identity.email)
      : await loadAdminUserByEmail(resolved.identity.email);

  if (!user) {
    await recordAdminLoginFailed({
      identity: resolved.identity,
      reason: "user_not_authorized",
      requestHeaders: resolved.requestHeaders,
    });
    return null;
  }

  if (!isDashboardRole(user.role)) {
    await recordAdminLoginFailed({
      identity: resolved.identity,
      user,
      reason: "role_not_allowed",
      requestHeaders: resolved.requestHeaders,
    });
    return user;
  }

  await recordAdminLoginSuccess({
    identity: resolved.identity,
    user,
    requestHeaders: resolved.requestHeaders,
  });
  return user;
}

export const verifyAdminSession = cache(
  async (requestHeaders?: Headers): Promise<AdminAuthUser> => {
    const user = await getCurrentAdminUser(requestHeaders);
    if (!user || !isDashboardRole(user.role)) {
      // 拒否は `notFound()`（最寄りの not-found 境界を**その場に描画**）で表現する。
      //
      // 旧実装は `redirect("/admin/access-denied")` だった。しかし本関数の呼び出し元は
      // いずれも `<Suspense>` の内側で評価される — admin は
      // `(dashboard)/layout.tsx` が `children` ごと Suspense に入れ
      // `DashboardChromeResolved` が `connection()` で suspend し、preview は
      // `(public)` 側の境界配下。ストリーミング開始後の `redirect()` は HTTP 3xx を
      // 返せず meta タグに劣化する（公式仕様。redirect API リファレンス「When used
      // in a streaming context, this will insert a meta tag to emit the redirect on
      // the client side.」）。劣化した meta refresh は axe の `meta-refresh`
      // critical (WCAG 2.2.1 / 2.2.4)。
      //
      // `notFound()` は遷移しないので meta タグ自体が出ない。権限拒否を
      // `notFound()` に寄せた `_helpers.ts` の `denyAdminAccess()` と揃う。
      // preview ページは既に隣接行の resource 権限拒否で `notFound()` を使っており、
      // 同一関数の 2 つの拒否が別方式だった不整合もこれで解消する。
      //
      // 表示は各 route group の最寄り境界: admin は `(dashboard)/not-found.tsx`
      // （「アクセス権限がない可能性があります」と明記）、preview は
      // `(public)/not-found.tsx`。権限の無いリソースの存在を秘匿する
      // （existence hiding）点でも 404 が適切。
      //
      // `/admin/access-denied` ページは残す。GBP OAuth callback（Route Handler）が
      // 使っており、そちらはストリーミングしないので実 3xx を返せる。
      notFound();
    }
    return user;
  },
);

export const isAdmin = cache(
  async (requestHeaders?: Headers): Promise<boolean> => {
    const user = await getCurrentAdminUser(requestHeaders);
    return user !== null && isAdminOrHigherRole(user.role);
  },
);

export async function getAdminSession(
  requestHeaders?: Headers,
): Promise<AdminSession | null> {
  const user = await getCurrentAdminUser(requestHeaders);
  return user ? { user } : null;
}
