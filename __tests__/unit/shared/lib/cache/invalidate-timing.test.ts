/**
 * `invalidateTagNowOrAfterResponse` — invalidate の実行フェーズ契約。
 *
 * - Server Action / Route Handler では **即時**（read-your-own-writes を保つ）
 * - render 中は Next.js が throw するので after フェーズへ委譲する
 * - それ以外の throw は設計ミスなので握らずログに残す
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
  ErrorCategory: { CACHE: "CACHE", UNKNOWN: "UNKNOWN" },
  ErrorSeverity: { LOW: "LOW" },
}));

const { invalidateTagNowOrAfterResponse } =
  await import("@/shared/lib/cache/invalidate-timing");

/** Next.js `revalidate.ts` が render フェーズで throw する実際の文言。 */
const RENDER_PHASE_ERROR =
  'Route /admin used "updateTag audit-logs:recent:x" during render which is unsupported. To ensure revalidation is performed consistently it must always happen outside of renders and cached functions.';

beforeEach(() => {
  afterCallbacks.length = 0;
  mockAfter.mockClear();
  mockLogError.mockClear();
});

describe("invalidateTagNowOrAfterResponse", () => {
  test("throw しない文脈（Server Action）では即時実行して after に積まない", () => {
    let ran = 0;

    invalidateTagNowOrAfterResponse(
      () => {
        ran += 1;
      },
      { operation: "test" },
    );

    // read-your-own-writes: action レスポンス前に tag を落とす必要がある
    expect(ran).toBe(1);
    expect(mockAfter).not.toHaveBeenCalled();
  });

  test("render フェーズの throw のときだけ after へ委譲する", () => {
    let attempts = 0;

    invalidateTagNowOrAfterResponse(
      () => {
        attempts += 1;
        if (attempts === 1) throw new Error(RENDER_PHASE_ERROR);
      },
      { operation: "test" },
    );

    expect(attempts).toBe(1);
    expect(mockAfter).toHaveBeenCalledTimes(1);

    afterCallbacks.forEach((callback) => {
      callback();
    });
    expect(attempts).toBe(2);
    expect(mockLogError).not.toHaveBeenCalled();
  });

  test("render 由来でない throw は after に逃がさずログに残す", () => {
    invalidateTagNowOrAfterResponse(
      () => {
        throw new Error(
          'Route /x used "updateTag y" inside a "use cache" which is unsupported.',
        );
      },
      { operation: "test" },
    );

    expect(mockAfter).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("after フェーズでの throw も呼び出し元へ伝播させない", () => {
    let attempts = 0;

    invalidateTagNowOrAfterResponse(
      () => {
        attempts += 1;
        throw attempts === 1
          ? new Error(RENDER_PHASE_ERROR)
          : new Error("boom");
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

  test("リクエストスコープ外（after が throw）では即時フォールバックする", () => {
    mockAfter.mockImplementationOnce(() => {
      throw new Error("after() was called outside a request scope");
    });

    let attempts = 0;
    invalidateTagNowOrAfterResponse(
      () => {
        attempts += 1;
        if (attempts === 1) throw new Error(RENDER_PHASE_ERROR);
      },
      { operation: "test" },
    );

    expect(attempts).toBe(2);
  });
});
