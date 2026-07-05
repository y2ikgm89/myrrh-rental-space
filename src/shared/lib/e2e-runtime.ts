import "server-only";

import { isLocalhostUrl, serverEnv } from "./env/server";

export function isLocalProductionE2ERuntime(): boolean {
  return (
    serverEnv.NODE_ENV === "production" &&
    serverEnv.E2E_RUNTIME === "1" &&
    isLocalhostUrl(serverEnv.ADMIN_APP_URL) &&
    isLocalhostUrl(serverEnv.BETTER_AUTH_URL) &&
    isLocalhostUrl(process.env["NEXT_PUBLIC_BASE_URL"]) &&
    isLocalhostUrl(process.env["NEXT_PUBLIC_APP_URL"])
  );
}

export function isCustomerE2ELoginEnabled(): boolean {
  return (
    process.env["NEXT_PUBLIC_ENABLE_E2E_LOGIN"] === "1" &&
    isLocalProductionE2ERuntime()
  );
}
