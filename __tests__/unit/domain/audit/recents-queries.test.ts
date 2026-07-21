import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Role } from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// Mocks (must precede module under test import — TDZ)
// =============================================================================

type AuditLogRow = {
  resource: string;
  resourceId: string | null;
  createdAt: Date;
};

const mockAuditLogFindMany = mock<() => Promise<AuditLogRow[]>>(() =>
  Promise.resolve([]),
);
const mockPageFindMany = mock<
  (args: {
    where: { id: { in: string[] } };
  }) => Promise<{ id: string; slug: string }[]>
>(() => Promise.resolve([]));
const mockHasPermission = mock<(role: Role, resource: string) => boolean>(
  () => true,
);

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: mock(() => undefined),
  updateTag: mock(() => undefined),
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: mockAuditLogFindMany,
    },
    page: {
      findMany: mockPageFindMany,
    },
  },
}));

mock.module("@/shared/lib/admin-permissions", () => ({
  hasPermission: (role: Role, resource: string) =>
    mockHasPermission(role, resource),
}));

const { getRecentAuditedResources } =
  await import("@/shared/domain/audit/recents-queries");

const ADMIN_ROLE = Role.ADMIN;
const USER_ID = "user-1";

function makeLog(
  resource: string,
  resourceId: string | null,
  daysAgo = 0,
): AuditLogRow {
  const createdAt = new Date(Date.now() - daysAgo * 86_400_000);
  return { resource, resourceId, createdAt };
}

describe("getRecentAuditedResources", () => {
  beforeEach(() => {
    mockAuditLogFindMany.mockReset();
    mockPageFindMany.mockReset();
    mockPageFindMany.mockResolvedValue([]);
    mockHasPermission.mockReset();
    mockHasPermission.mockReturnValue(true);
  });

  test("supported な resource を RecentItem に map する", async () => {
    mockAuditLogFindMany.mockResolvedValueOnce([
      makeLog("space", "space-aaa11111"),
      makeLog("post", "post-bbb22222", 1),
    ]);

    const items = await getRecentAuditedResources(USER_ID, ADMIN_ROLE);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "space:space-aaa11111",
      resource: "space",
      resourceId: "space-aaa11111",
      href: "/admin/spaces/space-aaa11111",
    });
    expect(items[1]).toMatchObject({
      id: "post:post-bbb22222",
      href: "/admin/posts/post-bbb22222",
    });
  });

  test("unsupported な resource は除外される", async () => {
    mockAuditLogFindMany.mockResolvedValueOnce([
      makeLog("space", "s1"),
      makeLog("UNKNOWN_RESOURCE", "x1"),
      makeLog("auditLog", "a1"), // SUPPORTED_RESOURCES に含まれない
    ]);

    const items = await getRecentAuditedResources(USER_ID, ADMIN_ROLE);

    expect(items).toHaveLength(1);
    expect(items[0]?.resource).toBe("space");
  });

  test("hasPermission が false の resource は除外される", async () => {
    mockAuditLogFindMany.mockResolvedValueOnce([
      makeLog("space", "s1"),
      makeLog("customer", "c1"),
    ]);
    // customer のみ権限なし
    mockHasPermission.mockImplementation(
      (_role: Role, resource: string) => resource !== "customer",
    );

    const items = await getRecentAuditedResources(USER_ID, ADMIN_ROLE);

    expect(items).toHaveLength(1);
    expect(items[0]?.resource).toBe("space");
  });

  test("同一 resource:resourceId の重複は最新 1 件に絞られる", async () => {
    mockAuditLogFindMany.mockResolvedValueOnce([
      makeLog("space", "s1", 0), // newest
      makeLog("space", "s1", 1), // duplicate (older)
      makeLog("space", "s2", 2),
    ]);

    const items = await getRecentAuditedResources(USER_ID, ADMIN_ROLE);

    expect(items).toHaveLength(2);
    expect(items.map((i: { resourceId: string }) => i.resourceId)).toEqual([
      "s1",
      "s2",
    ]);
  });

  test("limit を超えたら早期 break する", async () => {
    const logs = Array.from({ length: 30 }, (_, i) =>
      makeLog("space", `space-${i}`),
    );
    mockAuditLogFindMany.mockResolvedValueOnce(logs);

    const items = await getRecentAuditedResources(USER_ID, ADMIN_ROLE, 3);

    expect(items).toHaveLength(3);
  });

  test("Round-5 audit Finding #17: location は専用詳細ページへ直リンクする", async () => {
    mockAuditLogFindMany.mockResolvedValueOnce([
      makeLog("location", "loc-id-1"),
    ]);

    const items = await getRecentAuditedResources(USER_ID, ADMIN_ROLE);

    expect(items[0]?.href).toBe("/admin/locations/loc-id-1");
  });

  test("Round-5 audit Finding #17: faq は category/item のどちらか判別できないため一覧へ集約する", async () => {
    mockAuditLogFindMany.mockResolvedValueOnce([makeLog("faq", "faq-id-xyz")]);

    const items = await getRecentAuditedResources(USER_ID, ADMIN_ROLE);

    expect(items[0]?.href).toBe("/admin/faq");
  });

  test("Round-5 audit Finding #17: page は id から解決した slug で詳細ページへリンクする", async () => {
    mockAuditLogFindMany.mockResolvedValueOnce([
      makeLog("page", "page-id-abc"),
    ]);
    mockPageFindMany.mockResolvedValueOnce([
      { id: "page-id-abc", slug: "about-us" },
    ]);

    const items = await getRecentAuditedResources(USER_ID, ADMIN_ROLE);

    expect(mockPageFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["page-id-abc"] } },
      select: { id: true, slug: true },
    });
    expect(items[0]?.href).toBe("/admin/pages/about-us");
  });

  test("page: slug が解決できない場合 (削除済み等) は一覧 href にフォールバックする", async () => {
    mockAuditLogFindMany.mockResolvedValueOnce([
      makeLog("page", "page-id-deleted"),
    ]);
    mockPageFindMany.mockResolvedValueOnce([]);

    const items = await getRecentAuditedResources(USER_ID, ADMIN_ROLE);

    expect(items[0]?.href).toBe("/admin/pages");
  });

  test("news/inquiry は不規則複数形の正しい path segment を使う (newss/inquirys ではない)", async () => {
    mockAuditLogFindMany.mockResolvedValueOnce([
      makeLog("news", "news-id-1"),
      makeLog("inquiry", "inquiry-id-1"),
    ]);

    const items = await getRecentAuditedResources(USER_ID, ADMIN_ROLE);

    expect(items[0]?.href).toBe("/admin/news/news-id-1");
    expect(items[1]?.href).toBe("/admin/inquiries/inquiry-id-1");
  });
});
