import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";

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
};

/** select が実際に返す形の行を組む（`user` は含まれない = FK 撤去後の姿）。 */
function auditLogRow(
  overrides: Partial<AuditLogRow> & { id: string },
): AuditLogRow {
  return {
    sequence: 1n,
    previousHash: "0".repeat(64),
    entryHash: "a".repeat(64),
    hashAlgorithm: "HMAC-SHA256",
    hashKeyId: "v1",
    chainVersion: 1,
    userId: null,
    action: "CREATE",
    resource: "space",
    resourceId: null,
    oldValue: null,
    newValue: null,
    metadata: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  };
}

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

/**
 * `AuditLog.userId` は user への FK を持たない論理参照になったため
 * （証跡テーブルを FK の参照アクションで書き換えさせないため）、
 * 実行ユーザーの検索と表示はどちらも user への別クエリになる。
 */
const mockUserFindMany = mock<
  (args: {
    where?: unknown;
    select?: unknown;
  }) => Promise<{ id: string; name: string | null; email: string }[]>
>(() => Promise.resolve([]));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
    auditLog: {
      findMany: mockFindMany,
      count: mockCount,
      groupBy: mockGroupBy,
    },
    user: { findMany: mockUserFindMany },
  },
}));

await installPrismaEnumsMock({
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
});

const { getAuditLogs, getAuditLogsForExport, getAuditLogStats } =
  await import("@/shared/domain/audit-log/queries");

describe("getAuditLogs", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockCount.mockReset();
    mockGroupBy.mockReset();
    mockTransaction.mockReset();
    mockUserFindMany.mockReset();
    mockUserFindMany.mockResolvedValue([]);
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

  test("実行ユーザーは 1 回の追加クエリで貼り直され、削除済みなら null になる", async () => {
    // FK を外した結果 include が使えないので、userId を集めて user を引き直している。
    // ここが壊れると管理画面の監査ログから実行者名が丸ごと消える（例外は出ない）ため、
    // 「1 回だけ引く」「id で正しく合流する」「見つからなければ null」を明示的に固定する。
    mockFindMany.mockResolvedValueOnce([
      auditLogRow({ id: "log-1", userId: "user-a" }),
      auditLogRow({ id: "log-2", userId: "user-a" }),
      auditLogRow({ id: "log-3", userId: "deleted-user" }),
      auditLogRow({ id: "log-4", userId: null }),
    ]);
    mockUserFindMany.mockResolvedValueOnce([
      { id: "user-a", name: "運用担当", email: "ops@example.com" },
    ]);

    const result = await getAuditLogs({
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

    // 行数ぶん撃たない（N+1 防止）。重複 userId も 1 回にまとめる
    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["user-a", "deleted-user"] } },
      }),
    );

    expect(result.logs.map((log) => log.user)).toEqual([
      { id: "user-a", name: "運用担当", email: "ops@example.com" },
      { id: "user-a", name: "運用担当", email: "ops@example.com" },
      null, // 削除済みユーザー: userId は証跡として残るが表示情報は引けない
      null, // システム操作
    ]);
    // userId 自体は消えない（証跡として残すのが FK 撤去の目的）
    expect(result.logs.map((log) => log.userId)).toEqual([
      "user-a",
      "user-a",
      "deleted-user",
      null,
    ]);
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
    mockUserFindMany.mockResolvedValueOnce([
      { id: "user-hit", name: "admin", email: "admin@example.com" },
    ]);

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
            // FK が無いのでリレーションフィルタではなく、先に引いた id の in 句になる
            { userId: { in: ["user-hit"] } },
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

describe("getAuditLogStats", () => {
  const RealDate = Date;

  function withFixedNow<T>(isoUtc: string, fn: () => Promise<T>): Promise<T> {
    const fixedMs = new RealDate(isoUtc).getTime();
    const MockDate = class extends RealDate {
      constructor(value?: string | number | Date) {
        super(value === undefined ? fixedMs : value);
      }
      static override now(): number {
        return fixedMs;
      }
    };
    globalThis.Date = MockDate as DateConstructor;
    return fn().finally(() => {
      globalThis.Date = RealDate;
    });
  }

  beforeEach(() => {
    mockCount.mockReset();
    mockGroupBy.mockReset();
    mockCount.mockResolvedValue(0);
    mockGroupBy.mockResolvedValue([]);
  });

  test("today count は JST 日境界 (jstDayStartInstant) 以降で集計する", async () => {
    await withFixedNow("2026-06-30T14:30:00.000Z", async () => {
      await getAuditLogStats();
    });

    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: {
            gte: new Date("2026-06-29T15:00:00.000Z"),
          },
        },
      }),
    );
  });

  test("JST 日付が切り替わった直後は新しい JST 日の 00:00 以降で集計する", async () => {
    await withFixedNow("2026-06-30T15:00:00.000Z", async () => {
      await getAuditLogStats();
    });

    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: {
            gte: new Date("2026-06-30T15:00:00.000Z"),
          },
        },
      }),
    );
  });
});

describe("getAuditLogsForExport", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([]);
    mockUserFindMany.mockReset();
    mockUserFindMany.mockResolvedValue([]);
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
