import type { Route } from "next";

export type AppRoute = Route;

export function isAppRoute(href: string): href is AppRoute {
  return href.startsWith("/") && !href.startsWith("//");
}

export function toAppRoute(href: string): AppRoute {
  if (!isAppRoute(href)) {
    throw new Error(`Expected an internal application route: ${href}`);
  }

  return href;
}
