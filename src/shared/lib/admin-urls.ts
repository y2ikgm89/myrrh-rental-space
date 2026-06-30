import "server-only";

import { serverEnv } from "@/shared/lib/env/server";
import { getAppUrl } from "./constants/urls";

export function getAdminAppUrl(): string {
  return serverEnv.ADMIN_APP_URL ?? serverEnv.BETTER_AUTH_URL ?? getAppUrl();
}

export function getAdminRootUrl(): string {
  return `${getAdminAppUrl()}/admin`;
}

export function getAdminUrl(path: string): string {
  if (path === "" || path === "/") return getAdminRootUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAdminRootUrl()}${normalizedPath}`;
}
