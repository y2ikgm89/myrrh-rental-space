import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import { isValidRole } from "@/shared/lib/validations/enums/guards";
import {
  recordAdminLoginFailed,
  recordAdminLoginSuccess,
  type AdminAuthAuditIdentity,
} from "@/shared/domain/admin-auth/audit";
import {
  findAdminAuthUserByEmail,
  findOrSyncAdminAuthUserByEmail,
} from "@/shared/domain/admin-auth/queries";
import { resolveIapIdentity } from "@/shared/lib/iap/admin-iap-auth";
import { isAdminOrHigherRole, isDashboardRole } from "./admin-roles";
import { isLocalProductionE2ERuntime } from "./e2e-runtime";
import { serverEnv } from "./env/server";
import { isRecord } from "./serialize";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: Role;
  emailVerified: boolean;
};

export type AdminSession = {
  user: AdminUser;
};

/**
 * ダッシュボードアクセス可能なロール（Single Source of Truth は `admin-roles.ts`）。
 */
export { DASHBOARD_ROLES } from "./admin-roles";

async function resolveRequestHeaders(
  requestHeaders?: Headers,
): Promise<Headers> {
  return requestHeaders ?? (await headers());
}

function getTestIapEmail(): string | null {
  const isProductionRuntime = serverEnv.NODE_ENV === "production";
  if (isProductionRuntime && !isLocalProductionE2ERuntime()) return null;
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

  const testEmail = getTestIapEmail();
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

function coerceAdminUser(user: unknown): AdminUser | null {
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

export function getAdminSessionUser(session: unknown): AdminUser | null {
  if (!isRecord(session)) return null;
  return coerceAdminUser(session["user"]);
}

export async function getCurrentAdminUser(
  requestHeaders?: Headers,
): Promise<AdminUser | null> {
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
  async (requestHeaders?: Headers): Promise<AdminUser> => {
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
