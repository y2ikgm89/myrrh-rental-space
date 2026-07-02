import "server-only";

import { prisma } from "@/shared/db/prisma";
import { isDashboardRole } from "@/shared/lib/admin-roles";
import {
  isAdminRoleGroupSyncConfigured,
  syncAdminAuthUserFromGoogleGroups,
} from "./google-role-sync";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { serverEnv } from "@/shared/lib/env/server";
import type { Role } from "@/shared/lib/validations/enums/prisma-types";

export type AdminAuthUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: Role;
  emailVerified: boolean;
};

export async function findAdminAuthUserByEmail(
  email: string,
): Promise<AdminAuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      emailVerified: true,
    },
  });

  if (!user || !isDashboardRole(user.role)) return null;
  return user;
}

export async function findOrSyncAdminAuthUserByEmail(
  email: string,
): Promise<AdminAuthUser | null> {
  const isE2ETestIdentity =
    serverEnv.E2E_RUNTIME === "1" && serverEnv.ADMIN_TEST_IAP_EMAIL === email;

  try {
    if (!isE2ETestIdentity && isAdminRoleGroupSyncConfigured()) {
      return syncAdminAuthUserFromGoogleGroups(email);
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "findOrSyncAdminAuthUserByEmail.checkRoleGroupSync",
      },
    });
    return null;
  }

  return findAdminAuthUserByEmail(email);
}
