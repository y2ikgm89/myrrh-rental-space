import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import { isValidRole } from "@/shared/lib/validations/enums/guards";
import {
  findAdminAuthUserByEmail,
  findOrSyncAdminAuthUserByEmail,
} from "@/shared/domain/admin-auth/queries";
import { resolveIapIdentity } from "@/shared/lib/iap/admin-iap-auth";
import { isAdminOrHigherRole, isDashboardRole } from "./admin-roles";
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

type AdminIdentity = {
  email: string;
  source: "iap" | "test";
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
  const isCiRuntime = serverEnv.CI === "true";
  const isE2ERuntime = serverEnv.E2E_RUNTIME === "1";
  if (isProductionRuntime && !isCiRuntime && !isE2ERuntime) return null;
  return serverEnv.ADMIN_TEST_IAP_EMAIL ?? null;
}

async function resolveAdminIdentity(
  requestHeaders?: Headers,
): Promise<AdminIdentity | null> {
  const requestHeaderList = await resolveRequestHeaders(requestHeaders);

  try {
    const identity = await resolveIapIdentity(requestHeaderList);
    if (identity) return { email: identity.email, source: "iap" };
  } catch {
    return null;
  }

  const testEmail = getTestIapEmail();
  return testEmail ? { email: testEmail, source: "test" } : null;
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
  const identity = await resolveAdminIdentity(requestHeaders);
  if (!identity) return null;
  if (identity.source === "test") {
    return loadTestAdminUserByEmail(identity.email);
  }
  return loadAdminUserByEmail(identity.email);
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
