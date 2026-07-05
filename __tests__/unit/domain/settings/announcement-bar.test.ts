import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockAnnouncementBarFindMany = mock<() => Promise<Array<{ id: string }>>>(
  () => Promise.resolve([]),
);
const mockExecuteRaw = mock<
  (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>
>(() => Promise.resolve(0));
type TxClient = { $executeRaw: typeof mockExecuteRaw };
const mockTransaction = mock<
  (cb: (tx: TxClient) => Promise<unknown>) => Promise<unknown>
>((cb) => cb({ $executeRaw: mockExecuteRaw }));

mock.module("server-only", () => ({}));

mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    announcementBar: {
      findMany: mockAnnouncementBarFindMany,
    },
    $transaction: mockTransaction,
    $executeRaw: mockExecuteRaw,
  },
}));

type SqlFragment = { __sql: string; __values: unknown[] };

function isSqlFragment(value: unknown): value is SqlFragment {
  return (
    typeof value === "object" &&
    value !== null &&
    "__sql" in value &&
    "__values" in value
  );
}

mock.module("@generated/prisma/client", () => {
  const sql = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): SqlFragment => {
    let combined = "";
    for (let i = 0; i < strings.length; i++) {
      combined += strings[i];
      if (i < values.length) {
        const value = values[i];
        combined += isSqlFragment(value) ? value.__sql : "?";
      }
    }
    return { __sql: combined, __values: values };
  };

  return {
    Prisma: {
      sql,
      join: (items: SqlFragment[], separator = ", ") => ({
        __sql: items.map((item) => item.__sql).join(separator),
        __values: items.flatMap((item) => item.__values),
      }),
    },
  };
});

mock.module("@generated/prisma/enums", () => ({
  AnnouncementBarAnimation: {
    fade: "fade",
    slide: "slide",
    none: "none",
  },
  AnnouncementBarDesignStyle: {
    solid: "solid",
    gradient: "gradient",
    glass: "glass",
    stripe: "stripe",
  },
}));

const announcementBarCommands =
  (await import("@/shared/domain/settings/announcement-bar")) as unknown as {
    reorderAnnouncementBars: (
      orderedIds: readonly string[],
    ) => Promise<{ updated: number }>;
  };

describe("reorderAnnouncementBars", () => {
  beforeEach(() => {
    mockAnnouncementBarFindMany.mockReset();
    mockTransaction.mockReset();
    mockTransaction.mockImplementation((cb) =>
      cb({ $executeRaw: mockExecuteRaw }),
    );
    mockExecuteRaw.mockReset();
    mockExecuteRaw.mockResolvedValue(0);
  });

  test("orderedIds の全 ID が存在する場合だけ二段更新で再採番する", async () => {
    mockAnnouncementBarFindMany.mockResolvedValueOnce([
      { id: "bar-1" },
      { id: "bar-2" },
      { id: "bar-3" },
    ]);

    const result = await announcementBarCommands.reorderAnnouncementBars([
      "bar-1",
      "bar-2",
      "bar-3",
    ]);

    expect(result).toEqual({ updated: 3 });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(3);
    for (const call of mockExecuteRaw.mock.calls.slice(1)) {
      const sql = call[0].join("?");
      expect(sql).toContain("announcement_bars");
      expect(sql).toContain("displayOrder");
      expect(sql).toContain("CASE");
    }
  });

  test("存在しない ID を含む場合は SQL 実行前に NOT_FOUND", async () => {
    mockAnnouncementBarFindMany.mockResolvedValueOnce([
      { id: "bar-1" },
      { id: "bar-2" },
    ]);

    await expect(
      announcementBarCommands.reorderAnnouncementBars(["bar-1", "missing-id"]),
    ).rejects.toThrow("お知らせバーが見つかりません");

    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  test("重複 ID は DB アクセス前に拒否する", async () => {
    await expect(
      announcementBarCommands.reorderAnnouncementBars(["bar-1", "bar-1"]),
    ).rejects.toThrow("同じIDを複数指定することはできません");

    expect(mockAnnouncementBarFindMany).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  test("既存 ID の subset は過不足として拒否する", async () => {
    mockAnnouncementBarFindMany.mockResolvedValueOnce([
      { id: "bar-1" },
      { id: "bar-2" },
      { id: "bar-3" },
    ]);

    await expect(
      announcementBarCommands.reorderAnnouncementBars(["bar-1", "bar-2"]),
    ).rejects.toThrow("お知らせバー数が一致しません");

    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  test("空配列の場合は DB アクセスしない", async () => {
    const result = await announcementBarCommands.reorderAnnouncementBars([]);

    expect(result).toEqual({ updated: 0 });
    expect(mockAnnouncementBarFindMany).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });
});
