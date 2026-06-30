import "server-only";

import { serverEnv } from "@/shared/lib/env/server";
import { getAppUrl } from "./constants/urls";

export function getAdminAppUrl(): string {
  return serverEnv.ADMIN_APP_URL ?? serverEnv.BETTER_AUTH_URL ?? getAppUrl();
}

export function getAdminUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAdminAppUrl()}/admin${normalizedPath}`;
}
