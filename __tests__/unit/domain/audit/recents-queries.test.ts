import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { Role } from "@/shared/lib/validations/enums/prisma-types";

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
const mockHasPermission = mock<(role: Role, resource: string) => boolean>(
  () => true,
);

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: mockAuditLogFindMany,
    },
  },
}));

mock.module("@/admin/lib/permissions", () => ({
  hasPermission: (role: Role, resource: string) =>
    mockHasPermission(role, resource),
}));

const { getRecentAuditedResources } =
  await import("@/shared/domain/audit/recents-queries");

const ADMIN_ROLE = "ADMIN" as Role;
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
    expect(items.map((i) => i.resourceId)).toEqual(["s1", "s2"]);
  });

  test("limit を超えたら早期 break する", async () => {
    const logs = Array.from({ length: 30 }, (_, i) =>
      makeLog("space", `space-${i}`),
    );
    mockAuditLogFindMany.mockResolvedValueOnce(logs);

    const items = await getRecentAuditedResources(USER_ID, ADMIN_ROLE, 3);

    expect(items).toHaveLength(3);
  });

  test("page resource は ID 付きでなく一覧 href にルーティングされる", async () => {
    mockAuditLogFindMany.mockResolvedValueOnce([
      makeLog("page", "page-id-abc"),
      makeLog("faq", "faq-id-xyz"),
      makeLog("location", "loc-id-1"),
    ]);

    const items = await getRecentAuditedResources(USER_ID, ADMIN_ROLE);

    expect(items[0]?.href).toBe("/admin/pages");
    expect(items[1]?.href).toBe("/admin/faq/faq-id-xyz");
    expect(items[2]?.href).toBe("/admin/spaces?tab=locations");
  });
});
