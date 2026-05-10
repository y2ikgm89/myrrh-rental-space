import type { Route } from "next";

export function isAppRoute(href: string): href is Route {
  return href.startsWith("/") && !href.startsWith("//");
}

export function toAppRoute(href: string): Route {
  if (!isAppRoute(href)) {
    throw new Error(`Expected an internal application route: ${href}`);
  }

  return href;
}
