import "server-only";

import { prisma } from "@/shared/db/prisma";
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
import { isE2EAdminIdentityEmail } from "@/shared/domain/admin-auth/e2e-identity";
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
      dashboardEnabled: true,
    },
  });

  if (!user || !user.dashboardEnabled) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
    emailVerified: user.emailVerified,
  };
}

export async function findOrSyncAdminAuthUserByEmail(
  email: string,
): Promise<AdminAuthUser | null> {
  const isE2ETestIdentity =
    serverEnv.E2E_RUNTIME === "1" &&
    (serverEnv.ADMIN_TEST_IAP_EMAIL === email ||
      isE2EAdminIdentityEmail(email));

  try {
    if (!isE2ETestIdentity && isAdminRoleGroupSyncConfigured()) {
      // `await` は必須。付け忘れると sync 側の rejection がこの catch を素通りし、
      // HIGH ログも fail-closed の `null` も動かないまま呼び出し元へ伝播する。
      return await syncAdminAuthUserFromGoogleGroups(email);
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
