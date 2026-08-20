import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockCheckAdminAuth = mock<
  () => Promise<
    | { success: true; user: { id: string; role: string } }
    | { success: false; error: { error: string } }
  >
>(() =>
  Promise.resolve({
    success: true,
    user: { id: "admin-1", role: "ADMIN" },
  }),
);
const mockSearchLinkCardCandidates = mock(() => Promise.resolve([]));
const mockGetEnabledFeatures = mock(() => Promise.resolve({}));
const mockFilterEnabled = mock(() => []);

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkAdminAuth: mockCheckAdminAuth,
}));

mock.module("@/shared/domain/link-cards/search-queries", () => ({
  searchLinkCardCandidates: mockSearchLinkCardCandidates,
}));

mock.module("@/shared/domain/features/check", () => ({
  getEnabledFeatures: mockGetEnabledFeatures,
}));

mock.module("@/shared/domain/link-cards/content-types", () => ({
  LINK_CARD_CONTENT_TYPES: ["post", "news", "space", "event"],
  filterEnabledLinkCardContentTypes: mockFilterEnabled,
}));

const { GET: getSearch } =
  await import("@/app/(admin)/admin/api/link-cards/search/route");
const { GET: getContentTypes } =
  await import("@/app/(admin)/admin/api/link-cards/content-types/route");

describe("GET /admin/api/link-cards/* auth status", () => {
  beforeEach(() => {
    mockCheckAdminAuth.mockReset();
    mockSearchLinkCardCandidates.mockReset();
    mockGetEnabledFeatures.mockReset();
    mockFilterEnabled.mockReset();
    mockCheckAdminAuth.mockResolvedValue({
      success: true,
      user: { id: "admin-1", role: "ADMIN" },
    });
  });

  test("未ログインは 401 を返す", async () => {
    mockCheckAdminAuth.mockResolvedValue({
      success: false,
      error: { error: "ログインが必要です" },
    });

    const search = await getSearch(
      new Request(
        "http://localhost/admin/api/link-cards/search?contentType=post",
      ),
    );
    const types = await getContentTypes(
      new Request("http://localhost/admin/api/link-cards/content-types"),
    );

    expect(search.status).toBe(401);
    expect(types.status).toBe(401);
    expect(mockSearchLinkCardCandidates).not.toHaveBeenCalled();
    expect(mockGetEnabledFeatures).not.toHaveBeenCalled();
  });

  test("管理者権限不足は 403 を返す", async () => {
    mockCheckAdminAuth.mockResolvedValue({
      success: false,
      error: { error: "管理者権限が必要です" },
    });

    const search = await getSearch(
      new Request(
        "http://localhost/admin/api/link-cards/search?contentType=post",
      ),
    );
    const types = await getContentTypes(
      new Request("http://localhost/admin/api/link-cards/content-types"),
    );

    expect(search.status).toBe(403);
    expect(types.status).toBe(403);
    expect(mockSearchLinkCardCandidates).not.toHaveBeenCalled();
    expect(mockGetEnabledFeatures).not.toHaveBeenCalled();
  });
});
