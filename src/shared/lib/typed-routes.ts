import type { Route } from "next";
import { isSafeInternalRedirectPath } from "@/shared/lib/url/safe-internal-redirect";

export function isAppRoute(href: string): href is Route {
  return isSafeInternalRedirectPath(href);
}

export function toAppRoute(href: string): Route {
  if (!isAppRoute(href)) {
    throw new Error(`Expected an internal application route: ${href}`);
  }

  return href;
}
