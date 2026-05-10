import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockQueryRaw = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([{ "?column?": 1 }]),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $queryRaw: (..._args: unknown[]) => mockQueryRaw(),
  },
}));

const { runDatabaseHealthCheck } =
  await import("@/shared/domain/system/queries");

describe("runDatabaseHealthCheck", () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  test("DB 接続成功時は void で resolve", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);

    const result = await runDatabaseHealthCheck();

    expect(result).toBeUndefined();
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  test("DB 接続失敗時は throw（caller が catch して /api/health で 503 化）", async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error("Connection refused"));

    await expect(runDatabaseHealthCheck()).rejects.toThrow(
      "Connection refused",
    );
  });
});
