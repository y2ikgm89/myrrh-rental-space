/**
 * Next.js 16 typedRoutes の `Route<string>` 境界 helper SSoT。
 *
 * `typedRoutes: true` 環境では `string` を `Route<string>` に直接代入できないため、
 * `router.push(url)` / `redirect(url)` で動的 URL を渡す箇所の `as Route<string>` cast を
 * Zod 4 公式 `z.custom<T>` パターン (https://zod.dev/api#custom) で 1 箇所に集約する。
 *
 * 内部 app route（`/` 始まり）と外部 URL（`http(s)://`、OAuth provider redirect URL 等）の
 * 両方を許容する。`Route<string>` の template literal 型は Zod の output 型注釈で narrow
 * されるため、caller 側に cast が漏れない。
 */

import type { Route } from "next";
import { z } from "zod";

const isRouteLike = (value: unknown): value is Route<string> =>
  typeof value === "string" &&
  value.length > 0 &&
  (value.startsWith("/") || /^https?:\/\//.test(value));

const routeSchema = z.custom<Route<string>>(
  isRouteLike,
  "Route URL must start with / or http(s)://",
);

/**
 * 動的 URL 文字列を `Route<string>` に narrow する。不正な URL は `ZodError` を throw。
 */
export function toAppRoute(url: string): Route<string> {
  return routeSchema.parse(url);
}

/**
 * 動的 URL 文字列を `Route<string>` に narrow する。不正な URL は `null` を返す。
 */
export function safeToAppRoute(url: string): Route<string> | null {
  const result = routeSchema.safeParse(url);
  return result.success ? result.data : null;
}
