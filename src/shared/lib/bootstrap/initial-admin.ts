import "server-only";

import { ensureInitialSuperAdmin } from "@/shared/domain/bootstrap/initial-admin";
import { serverEnv } from "@/shared/lib/env/server";

export async function bootstrapInitialAdmin(): Promise<void> {
  const email = serverEnv.INITIAL_ADMIN_EMAIL;
  if (!email) return;

  const name = serverEnv.INITIAL_ADMIN_NAME ?? email;
  await ensureInitialSuperAdmin({ email, name });
}
