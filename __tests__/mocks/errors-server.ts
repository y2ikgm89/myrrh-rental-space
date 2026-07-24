/**
 * `@/shared/lib/errors/server` の mock.module ヘルパー。
 *
 * Bun の `mock.module` はモジュール全体を差し替える。部分 export だけ返すと、
 * 依存グラフ上の別モジュールが `safeFetch` / `criticalFetch` 等を import した瞬間に
 * `SyntaxError: Export named 'X' not found` になる。
 *
 * 公式に近い安全策は実モジュールを spread して必要な export だけ override すること
 * （repo 内 `send.test.ts` の「Bun 公式 re-export pattern」と同じ）。
 *
 * @see https://bun.sh/docs/test/mocks
 */

import { mock } from "bun:test";

type ErrorsServerModule = typeof import("@/shared/lib/errors/server");

export type ErrorsServerMockOverrides = Partial<{
  logError: ErrorsServerModule["logError"];
  normalizeError: ErrorsServerModule["normalizeError"];
  createErrorLogger: ErrorsServerModule["createErrorLogger"];
  safeFetch: ErrorsServerModule["safeFetch"];
  criticalFetch: ErrorsServerModule["criticalFetch"];
}>;

/**
 * `mock.module("@/shared/lib/errors/server", …)` を登録する。
 * SUT の dynamic import より前に呼ぶこと。
 */
export async function installErrorsServerMock(
  overrides: ErrorsServerMockOverrides = {},
): Promise<ErrorsServerModule> {
  const actual = await import("@/shared/lib/errors/server");
  mock.module("@/shared/lib/errors/server", () => ({
    ...actual,
    ...overrides,
  }));
  return actual;
}

/** logError を noop mock に差し替える最短形。 */
export async function installErrorsServerLogErrorMock(
  logError: ErrorsServerModule["logError"] = mock(() => {}),
): Promise<{
  actual: ErrorsServerModule;
  logError: ErrorsServerModule["logError"];
}> {
  const actual = await installErrorsServerMock({ logError });
  return { actual, logError };
}
