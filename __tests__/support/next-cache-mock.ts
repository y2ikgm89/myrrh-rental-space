import { mock } from "bun:test";

/** cacheComponents ランタイム外の unit/integration テスト用 `next/cache` stub。 */
export function installNextCacheMock(): void {
  mock.module("next/cache", () => ({
    cacheLife: mock(() => undefined),
    cacheTag: mock(() => undefined),
    revalidateTag: mock(() => undefined),
    updateTag: mock(() => undefined),
  }));
}
