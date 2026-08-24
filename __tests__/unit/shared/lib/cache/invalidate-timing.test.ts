/**
 * `invalidateTagNowOrAfterResponse` — 文脈ごとに使える API が違う、その振り分け契約。
 *
 * | 文脈 | Next の挙動 | 期待 |
 * | --- | --- | --- |
 * | Server Action | `updateTag` 成功 | 即時（read-your-own-writes） |
 * | Route Handler / cron | `E872` | `revalidateTag(tag, { expire: 0 })` へ切替 |
 * | render 中 | `E7` | `after` フェーズへ委譲 |
 * | `"use cache"` 内など | その他コード | 握らずログ |
 *
 * 監査 A-62: 旧実装はコールバックを受け取り、判定を
 * `"during render which is unsupported"` の部分一致で行っていた。
 * `E872`（Route Handler）はこの文言を含まないので「設計ミス」に分類され、
 * **CSV エクスポート・領収書 PDF のたびに偽のエラーを吐いて invalidate を捨てていた**。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const afterCallbacks: (() => void)[] = [];
const mockAfter = mock((callback: () => void) => {
  afterCallbacks.push(callback);
});

mock.module("next/server", () => ({
  after: mockAfter,
}));

const mockUpdateTag = mock((_tag: string) => undefined);
const mockRevalidateTag = mock(
  (_tag: string, _profile: { expire: number }) => undefined,
);
mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
  revalidateTag: mockRevalidateTag,
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

/** Next.js `revalidate.js` の throw を再現する（`__NEXT_ERROR_CODE` つき）。 */
function nextError(message: string, code: string): Error {
  return Object.defineProperty(new Error(message), "__NEXT_ERROR_CODE", {
    value: code,
    enumerable: false,
    configurable: true,
  });
}

/** render フェーズ（E7）。 */
const renderPhaseError = (): Error =>
  nextError(
    'Route /admin used "updateTag audit-logs:recent:x" during render which is unsupported.',
    "E7",
  );

/** Route Handler（E872）。**文言に "during render" を含まない。** */
const routeHandlerError = (): Error =>
  nextError(
    "updateTag can only be called from within a Server Action. To invalidate cache tags in Route Handlers or other contexts, use revalidateTag instead.",
    "E872",
  );

const TAG = "audit-logs:recent:user-1";

beforeEach(() => {
  afterCallbacks.length = 0;
  mockAfter.mockClear();
  mockLogError.mockClear();
  mockUpdateTag.mockClear();
  mockRevalidateTag.mockClear();
});

describe("invalidateTagNowOrAfterResponse", () => {
  test("Server Action では updateTag を即時に呼び、after に積まない", () => {
    invalidateTagNowOrAfterResponse(TAG, { operation: "test" });

    // read-your-own-writes: action レスポンス前に tag を落とす必要がある
    expect(mockUpdateTag).toHaveBeenCalledWith(TAG);
    expect(mockAfter).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    expect(mockLogError).not.toHaveBeenCalled();
  });

  test("Route Handler（E872）では revalidateTag へ切り替え、ログを吐かない", () => {
    mockUpdateTag.mockImplementationOnce(() => {
      throw routeHandlerError();
    });

    invalidateTagNowOrAfterResponse(TAG, { operation: "test" });

    expect(mockRevalidateTag).toHaveBeenCalledWith(TAG, { expire: 0 });
    expect(mockAfter).not.toHaveBeenCalled();
    // ここが A-62 の本体 — 正常な文脈なのにエラーを積んでいた。
    expect(mockLogError).not.toHaveBeenCalled();
  });

  test("Route Handler で revalidateTag も失敗したらログに残す", () => {
    mockUpdateTag.mockImplementationOnce(() => {
      throw routeHandlerError();
    });
    mockRevalidateTag.mockImplementationOnce(() => {
      throw nextError("Invariant: static generation store missing", "E263");
    });

    invalidateTagNowOrAfterResponse(TAG, { operation: "test" });

    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("render フェーズ（E7）のときだけ after へ委譲する", () => {
    mockUpdateTag.mockImplementationOnce(() => {
      throw renderPhaseError();
    });

    invalidateTagNowOrAfterResponse(TAG, { operation: "test" });

    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockRevalidateTag).not.toHaveBeenCalled();

    afterCallbacks.forEach((callback) => {
      callback();
    });
    expect(mockUpdateTag).toHaveBeenCalledTimes(2);
    expect(mockLogError).not.toHaveBeenCalled();
  });

  test('"use cache" 内（E181）は after にも revalidateTag にも逃がさずログに残す', () => {
    mockUpdateTag.mockImplementationOnce(() => {
      throw nextError(
        'Route /x used "updateTag y" inside a "use cache" which is unsupported.',
        "E181",
      );
    });

    invalidateTagNowOrAfterResponse(TAG, { operation: "test" });

    expect(mockAfter).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("__NEXT_ERROR_CODE を持たない throw もログに残す", () => {
    mockUpdateTag.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    invalidateTagNowOrAfterResponse(TAG, { operation: "test" });

    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("after フェーズでの throw も呼び出し元へ伝播させない", () => {
    mockUpdateTag
      .mockImplementationOnce(() => {
        throw renderPhaseError();
      })
      .mockImplementationOnce(() => {
        throw new Error("boom");
      });

    invalidateTagNowOrAfterResponse(TAG, { operation: "test" });

    expect(() => {
      afterCallbacks.forEach((callback) => {
        callback();
      });
    }).not.toThrow();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("リクエストスコープ外（after が throw）では即時フォールバックする", () => {
    mockUpdateTag.mockImplementationOnce(() => {
      throw renderPhaseError();
    });
    mockAfter.mockImplementationOnce(() => {
      throw new Error("after() was called outside a request scope");
    });

    invalidateTagNowOrAfterResponse(TAG, { operation: "test" });

    expect(mockUpdateTag).toHaveBeenCalledTimes(2);
  });
});
