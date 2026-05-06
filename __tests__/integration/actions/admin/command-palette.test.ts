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
  formSubmitRateLimiter: {},
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

import { searchAdminResources } from "@/admin/actions/command-palette/search";

describe("searchAdminResources", () => {
  beforeEach(() => {
    mockCheckAuth.mockClear();
    mockSearchByResource.mockClear();
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

  test("認証失敗時はエラー返却", async () => {
    mockCheckAuth.mockImplementationOnce(async () => ({
      success: false as const,
      error: { error: "ログインが必要です" },
    }));
    const result = await searchAdminResources("test");
    expect("error" in result).toBe(true);
  });
});
