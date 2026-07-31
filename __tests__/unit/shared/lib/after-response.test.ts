/**
 * `afterResponse` — cache tag invalidate を after フェーズへ委譲する契約。
 *
 * `updateTag` / `revalidateTag` は render フェーズで呼ぶと Next.js が throw する
 * （`revalidate.ts` の `workUnitStore.phase === "render"` ガード）。監査ログ書込は
 * Server Action だけでなく page render 中（`requireAdminPermission` の
 * PERMISSION_DENIED / IAP ログイン記録）からも走るため、直接呼ぶと invalidate が
 * 黙って失われる。after フェーズは同ガードが明示的に許可しているので、
 * 「inline で呼ばず after() に登録する」ことをここで固定する。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const afterCallbacks: (() => void)[] = [];
const mockAfter = mock((callback: () => void) => {
  afterCallbacks.push(callback);
});

mock.module("next/server", () => ({
  after: mockAfter,
}));

const mockLogError = mock(() => undefined);
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (err: unknown) =>
    err instanceof Error ? err : new Error(String(err)),
  ErrorCategory: { DATABASE: "DATABASE", UNKNOWN: "UNKNOWN" },
  ErrorSeverity: { LOW: "LOW" },
}));

const { afterResponse } = await import("@/shared/lib/async-utils");

beforeEach(() => {
  afterCallbacks.length = 0;
  mockAfter.mockClear();
  mockLogError.mockClear();
});

describe("afterResponse", () => {
  test("リクエストスコープ内では inline 実行せず after() に登録する", () => {
    let ran = false;

    afterResponse(
      () => {
        ran = true;
      },
      { operation: "test" },
    );

    // ここが本質: render 中に同期実行されると Next.js が throw する
    expect(ran).toBe(false);
    expect(mockAfter).toHaveBeenCalledTimes(1);

    afterCallbacks.forEach((callback) => {
      callback();
    });
    expect(ran).toBe(true);
  });

  test("after フェーズで throw しても呼び出し元へ伝播せずログに集約する", () => {
    afterResponse(
      () => {
        throw new Error("updateTag failed");
      },
      { operation: "test" },
    );

    expect(() => {
      afterCallbacks.forEach((callback) => {
        callback();
      });
    }).not.toThrow();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("リクエストスコープ外（after が throw）では即時実行にフォールバックする", () => {
    mockAfter.mockImplementationOnce(() => {
      throw new Error("after() was called outside a request scope");
    });

    let ran = false;
    afterResponse(
      () => {
        ran = true;
      },
      { operation: "test" },
    );

    expect(ran).toBe(true);
  });
});
