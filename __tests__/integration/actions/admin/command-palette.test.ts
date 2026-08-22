import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type AuthResult =
  | { success: true; user: { id: string; role: string } }
  | { success: false; error: { error: string } };

const mockCheckAuth = mock<() => Promise<AuthResult>>(async () => ({
  success: true,
  user: { id: "user-1", role: "SUPER_ADMIN" },
}));
const mockCheckRate = mock(async () => ({ success: true as const }));
const mockSearchByResource = mock(async (resource: string, _q: string) => ({
  resource,
  items: [
    {
      id: "x",
      resource,
      label: `${resource}-result`,
      href: `/admin/${resource}`,
    },
  ],
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkAdminAuth: mockCheckAuth,
}));
mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckRate,
}));
mock.module("@/shared/lib/rate-limit", () => ({
  // Round-5 audit Finding #23: formSubmitRateLimiter (5/分) はライブ検索には
  // 厳しすぎるため expensiveAdminRateLimiter (60/分、customers/search と同種) に
  // 変更済み。search.ts の import 対象と一致させる。
  expensiveAdminRateLimiter: {},
}));
mock.module("@/shared/domain/admin-search/queries", () => ({
  searchByResource: mockSearchByResource,
  SEARCHABLE_RESOURCES: [
    "space",
    "customer",
    "reservation",
    "post",
    "news",
    "page",
    "event",
    "inquiry",
    "faq",
    "coupon",
    "location",
  ],
}));
mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}));

const actualErrorsServer = await import("@/shared/lib/errors/server");
const mockLogError = mock((..._args: unknown[]) => undefined);
mock.module("@/shared/lib/errors/server", () => ({
  ...actualErrorsServer,
  logError: (...args: unknown[]) => mockLogError(...args),
}));

import { searchAdminResources } from "@/admin/actions/command-palette/search";

describe("searchAdminResources", () => {
  beforeEach(() => {
    mockCheckAuth.mockClear();
    mockSearchByResource.mockClear();
    mockLogError.mockClear();
  });

  afterEach(() => {
    mockCheckRate.mockClear();
  });

  test("空クエリは空 groups を返す", async () => {
    const result = await searchAdminResources("");
    if ("error" in result) throw new Error("Expected success");
    expect(result.groups).toEqual([]);
  });

  test("1 文字クエリは空 groups を返す（ノイズ抑制）", async () => {
    const result = await searchAdminResources("a");
    if ("error" in result) throw new Error("Expected success");
    expect(result.groups).toEqual([]);
  });

  test("有効クエリは 11 resource 並列検索", async () => {
    const result = await searchAdminResources("test");
    if ("error" in result) throw new Error("Expected success");
    expect(mockSearchByResource).toHaveBeenCalledTimes(11);
    expect(result.groups.length).toBe(11);
  });

  /**
   * 部分失敗を握りつぶさない（監査 A-23）。
   *
   * `searchByResource` は内部 try/catch を持たないので prisma の失敗は
   * そのまま reject する。旧実装は rejected 分岐が無く、壊れた resource を
   * 「0 件」と見分けがつかない結果を黙って返していた。
   */
  test("1 resource が落ちても他は返し、落ちた resource 名をログに残す", async () => {
    mockSearchByResource.mockImplementation(
      async (resource: string, _q: string) => {
        if (resource === "page") throw new Error("db down");
        return {
          resource,
          items: [
            {
              id: "x",
              resource,
              label: `${resource}-result`,
              href: `/admin/${resource}`,
            },
          ],
        };
      },
    );

    const result = await searchAdminResources("test");
    if ("error" in result) throw new Error("Expected success");

    expect(result.groups.length).toBe(10);
    expect(mockLogError).toHaveBeenCalledTimes(1);
    const context = (
      mockLogError.mock.calls[0]?.[1] as
        { context?: { resource?: string } } | undefined
    )?.context;
    expect(context?.resource).toBe("page");

    mockSearchByResource.mockImplementation(
      async (resource: string, _q: string) => ({
        resource,
        items: [
          {
            id: "x",
            resource,
            label: `${resource}-result`,
            href: `/admin/${resource}`,
          },
        ],
      }),
    );
  });

  test("認証失敗時はエラー返却", async () => {
    mockCheckAuth.mockImplementationOnce(async () => ({
      success: false as const,
      error: { error: "ログインが必要です" },
    }));
    const result = await searchAdminResources("test");
    expect("error" in result).toBe(true);
  });
});
