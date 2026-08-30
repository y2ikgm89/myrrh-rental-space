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

  // try が守るのは **設定の読み取りだけ**（operation 名のとおり checkRoleGroupSync）。
  // `isAdminRoleGroupSyncConfigured` は role group env が部分的にしか設定されて
  // いないと throw するので、その場合は fail-closed で null を返す。
  //
  // sync 本体をこの try に入れない。入れる（= `return await` にする）と DB 障害まで
  // ここで null になり、呼び出し元の `getCurrentAdminUser` が
  // `recordAdminLoginFailed(reason: "user_not_authorized")` を書いてしまう。
  // 実際には認可されている利用者なので、監査ログに事実と異なる記録が残り、
  // permission-denied のスパイク通知まで誤って鳴りうる。sync 側の失敗のうち
  // Google API 由来のものは `syncAdminAuthUserFromGoogleGroups` が自前の
  // catch で HIGH ログ + null に畳んでおり、残る DB 障害は例外のまま上へ返す。
  let useGoogleGroupSync: boolean;
  try {
    useGoogleGroupSync = !isE2ETestIdentity && isAdminRoleGroupSyncConfigured();
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

  if (useGoogleGroupSync) {
    return syncAdminAuthUserFromGoogleGroups(email);
  }

  return findAdminAuthUserByEmail(email);
}
