import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

type AuditLogRow = {
  id: string;
  sequence: bigint;
  previousHash: string;
  entryHash: string;
  hashAlgorithm: string;
  hashKeyId: string;
  chainVersion: number;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  oldValue: unknown;
  newValue: unknown;
  metadata: unknown;
  createdAt: Date;
  user: { id: string; name: string | null; email: string } | null;
};

const mockFindMany = mock<() => Promise<AuditLogRow[]>>(() =>
  Promise.resolve([]),
);
const mockCount = mock<() => Promise<number>>(() => Promise.resolve(0));
const mockGroupBy = mock<
  () => Promise<Array<{ action: string; _count: { action: number } }>>
>(() => Promise.resolve([]));
const mockTransaction = mock(
  async (
    callback: (tx: {
      auditLog: { findMany: typeof mockFindMany; count: typeof mockCount };
    }) => Promise<unknown>,
  ) =>
    callback({
      auditLog: {
        findMany: mockFindMany,
        count: mockCount,
      },
    }),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
    auditLog: {
      findMany: mockFindMany,
      count: mockCount,
      groupBy: mockGroupBy,
    },
  },
}));

mock.module("@generated/prisma/enums", () => ({
  AuditAction: {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    PUBLISH: "PUBLISH",
    EXPORT: "EXPORT",
    LOGIN_SUCCESS: "LOGIN_SUCCESS",
    LOGIN_FAILED: "LOGIN_FAILED",
    LOGOUT: "LOGOUT",
    PASSWORD_CHANGE: "PASSWORD_CHANGE",
    PASSWORD_RESET_REQUEST: "PASSWORD_RESET_REQUEST",
    PASSWORD_RESET_FAILED: "PASSWORD_RESET_FAILED",
    PERMISSION_DENIED: "PERMISSION_DENIED",
    ROLE_CHANGE: "ROLE_CHANGE",
    INTEGRITY_CHECK: "INTEGRITY_CHECK",
  },
}));

const { getAuditLogs, getAuditLogsForExport } =
  await import("@/shared/domain/audit-log/queries");

describe("getAuditLogs", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockCount.mockReset();
    mockGroupBy.mockReset();
    mockTransaction.mockReset();
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockGroupBy.mockResolvedValue([]);
    mockTransaction.mockImplementation(
      async (
        callback: (tx: {
          auditLog: { findMany: typeof mockFindMany; count: typeof mockCount };
        }) => Promise<unknown>,
      ) =>
        callback({
          auditLog: {
            findMany: mockFindMany,
            count: mockCount,
          },
        }),
    );
  });

  test("一覧と total count は同一 transaction で取得する", async () => {
    await getAuditLogs({
      page: 1,
      perPage: 20,
      action: "ALL",
      resource: "",
      userId: "",
      dateFrom: "",
      dateTo: "",
      search: "",
      ipAddress: "",
      securityOnly: false,
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "RepeatableRead" }),
    );
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockCount).toHaveBeenCalledTimes(1);
  });

  test("dateFrom/dateTo は JST の日付範囲全体として絞り込む", async () => {
    await getAuditLogs({
      page: 1,
      perPage: 20,
      action: "ALL",
      resource: "",
      userId: "",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-01",
      search: "",
      ipAddress: "",
      securityOnly: false,
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date("2026-06-30T15:00:00.000Z"),
            lte: new Date("2026-07-01T14:59:59.999Z"),
          },
        }),
      }),
    );
  });

  test("search は resource/resourceId/user name/email を横断検索する", async () => {
    await getAuditLogs({
      page: 1,
      perPage: 20,
      action: "ALL",
      resource: "",
      userId: "",
      dateFrom: "",
      dateTo: "",
      search: "admin@example.com",
      ipAddress: "",
      securityOnly: false,
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              resource: {
                contains: "admin@example.com",
                mode: "insensitive",
              },
            },
            {
              resourceId: {
                contains: "admin@example.com",
                mode: "insensitive",
              },
            },
            {
              user: {
                is: {
                  email: {
                    contains: "admin@example.com",
                    mode: "insensitive",
                  },
                },
              },
            },
            {
              user: {
                is: {
                  name: {
                    contains: "admin@example.com",
                    mode: "insensitive",
                  },
                },
              },
            },
          ]),
        }),
      }),
    );
  });

  test("securityOnly と ipAddress はセキュリティイベントに絞り込む", async () => {
    await getAuditLogs({
      page: 1,
      perPage: 20,
      action: "ALL",
      resource: "",
      userId: "",
      dateFrom: "",
      dateTo: "",
      search: "",
      ipAddress: "203.0.113.10",
      securityOnly: true,
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: {
            in: expect.arrayContaining([
              "LOGIN_SUCCESS",
              "LOGIN_FAILED",
              "LOGOUT",
              "PERMISSION_DENIED",
              "PASSWORD_CHANGE",
              "PASSWORD_RESET_REQUEST",
              "PASSWORD_RESET_FAILED",
              "ROLE_CHANGE",
            ]),
          },
          metadata: {
            path: ["ipAddress"],
            string_contains: "203.0.113.10",
          },
        }),
      }),
    );
  });
});

describe("getAuditLogsForExport", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([]);
  });

  test("export は同じ filter を使い最大 10000 件を古い順で取得する", async () => {
    await getAuditLogsForExport({
      page: 1,
      perPage: 20,
      action: "EXPORT",
      resource: "auditLog",
      userId: "",
      dateFrom: "",
      dateTo: "",
      search: "audit",
      ipAddress: "",
      securityOnly: false,
    });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: "EXPORT",
          resource: "auditLog",
        }),
        orderBy: { createdAt: "asc" },
        take: 10000,
      }),
    );
  });
});
