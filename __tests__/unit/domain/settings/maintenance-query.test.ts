import { beforeEach, describe, expect, mock, test } from "bun:test";

const cacheLifeMock = mock(() => {});
const cacheTagMock = mock(() => {});
mock.module("next/cache", () => ({
  cacheLife: cacheLifeMock,
  cacheTag: cacheTagMock,
}));

mock.module("server-only", () => ({}));

// site.ts が LayoutWidth を top-level import するため、generated client 未生成でも
// このファイル単体で動くよう stub する。
mock.module("@generated/prisma/enums", () => ({
  LayoutWidth: { LG: "LG", MD: "MD", SM: "SM", XL: "XL", FULL: "FULL" },
}));

const findUnique = mock<(_args?: unknown) => Promise<unknown>>(() =>
  Promise.resolve(null),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settingsSystem: {
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
  safeFetch: async <T>(opts: {
    fetch: () => Promise<T>;
    fallback: T;
  }): Promise<T> => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  },
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { LOW: "LOW", HIGH: "HIGH" },
}));

const { getMaintenanceSettings } =
  await import("@/shared/domain/settings/queries/site");

describe("getMaintenanceSettings", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findUnique.mockResolvedValue(null);
  });

  test("DB 成功時は実設定を返す（row 欠落は maintenance OFF）", async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(getMaintenanceSettings()).resolves.toEqual({
      maintenanceMode: false,
      maintenanceMessage: null,
    });

    findUnique.mockResolvedValueOnce({
      maintenanceMode: true,
      maintenanceMessage: "作業中",
    });
    await expect(getMaintenanceSettings()).resolves.toEqual({
      maintenanceMode: true,
      maintenanceMessage: "作業中",
    });
  });

  test("DB エラー時は throw し、fail-closed fallback をキャッシュしない", async () => {
    findUnique.mockImplementationOnce(() => {
      throw new Error("connection lost");
    });

    await expect(getMaintenanceSettings()).rejects.toThrow("connection lost");
  });
});
