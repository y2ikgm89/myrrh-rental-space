/**
 * fetchAdminJson ユニットテスト
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { z } from "zod";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";

const testSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const originalFetch = globalThis.fetch;
const fetchImpl = Object.assign(
  (_input: Parameters<typeof globalThis.fetch>[0]) =>
    Promise.resolve(new Response()),
  { preconnect: originalFetch.preconnect },
);
const mockFetch = Object.assign(mock(fetchImpl), {
  preconnect: originalFetch.preconnect,
});

function mockJsonResponse(
  body: unknown,
  init?: { ok?: boolean; status?: number },
): void {
  const impl = Object.assign(
    (_input: Parameters<typeof globalThis.fetch>[0]) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status:
            init?.ok === false ? (init.status ?? 400) : (init?.status ?? 200),
          headers: { "Content-Type": "application/json" },
        }),
      ),
    { preconnect: originalFetch.preconnect },
  );
  mockFetch.mockImplementationOnce(impl);
}

beforeEach(() => {
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  mockFetch.mockClear();
});

describe("fetchAdminJson", () => {
  test("schema に一致するレスポンスを返す", async () => {
    mockJsonResponse({ id: "1", name: "テスト" });

    const result = await fetchAdminJson("/admin/api/example", testSchema);

    expect(result).toEqual({ id: "1", name: "テスト" });
    expect(mockFetch).toHaveBeenCalledWith("/admin/api/example", {
      credentials: "same-origin",
    });
  });

  test("RequestInit を fetch に渡す", async () => {
    mockJsonResponse({ id: "1", name: "テスト" });

    await fetchAdminJson("/admin/api/example", testSchema, {
      cache: "no-store",
    });

    expect(mockFetch).toHaveBeenCalledWith("/admin/api/example", {
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  test("schema 不一致時は検証エラーを throw する", async () => {
    mockJsonResponse({ id: 123, name: "テスト" });

    await expect(
      fetchAdminJson("/admin/api/example", testSchema),
    ).rejects.toThrow("admin API レスポンスの検証に失敗しました");
  });

  test("HTTP エラー時は API の error メッセージを throw する", async () => {
    mockJsonResponse({ error: "権限がありません" }, { ok: false, status: 403 });

    await expect(
      fetchAdminJson("/admin/api/example", testSchema),
    ).rejects.toThrow("権限がありません");
  });

  test("HTTP エラーで error フィールドが無い場合は汎用メッセージを throw する", async () => {
    mockJsonResponse(null, { ok: false, status: 500 });

    await expect(
      fetchAdminJson("/admin/api/example", testSchema),
    ).rejects.toThrow("データの取得に失敗しました");
  });
});
