import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
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
      redirect("/admin/access-denied");
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
