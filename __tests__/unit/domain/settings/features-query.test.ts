import { beforeEach, describe, expect, mock, test } from "bun:test";

const cacheLifeMock = mock(() => {});
const cacheTagMock = mock(() => {});
mock.module("next/cache", () => ({
  cacheLife: cacheLifeMock,
  cacheTag: cacheTagMock,
}));

mock.module("server-only", () => ({}));

const findUnique = mock<(_args?: unknown) => Promise<unknown>>(() =>
  Promise.resolve(null),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settingsFeatures: {
      findUnique: (args: unknown) => findUnique(args),
    },
  },
}));

interface CriticalFetchOpts<T> {
  readonly fetch: () => Promise<T>;
}
mock.module("@/shared/lib/errors/server", () => ({
  criticalFetch: async <T>(opts: CriticalFetchOpts<T>): Promise<T> =>
    opts.fetch(),
  ErrorCategory: { DATABASE: "DATABASE" },
}));

const { getFeatureModulesSettings } =
  await import("@/shared/domain/settings/queries/features");

describe("getFeatureModulesSettings", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findUnique.mockResolvedValue(null);
    cacheLifeMock.mockClear();
    cacheTagMock.mockClear();
  });

  test("DB 成功時に featureModules を parse して返す", async () => {
    findUnique.mockResolvedValueOnce({
      featureModules: { spaces: true, reservation: false },
    });

    const result = await getFeatureModulesSettings();

    expect(result).toEqual({ spaces: true, reservation: false });
    expect(cacheLifeMock).toHaveBeenCalled();
    expect(cacheTagMock).toHaveBeenCalled();
  });

  test("DB 成功で row 欠落 / 空 JSON は {}（欠落 key fail-closed）", async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(getFeatureModulesSettings()).resolves.toEqual({});

    findUnique.mockResolvedValueOnce({ featureModules: {} });
    await expect(getFeatureModulesSettings()).resolves.toEqual({});
  });

  test("DB エラー時は throw し、空 map にフォールバックしない", async () => {
    findUnique.mockImplementationOnce(() => {
      throw new Error("connection lost");
    });

    await expect(getFeatureModulesSettings()).rejects.toThrow(
      "connection lost",
    );
  });
});
