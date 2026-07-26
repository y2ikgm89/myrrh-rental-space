import { beforeEach, describe, expect, mock, test } from "bun:test";

const cacheLifeMock = mock(() => {});
const cacheTagMock = mock(() => {});
mock.module("next/cache", () => ({
  cacheLife: cacheLifeMock,
  cacheTag: cacheTagMock,
}));

const spaceFindMany = mock<(_args?: unknown) => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: {
      findMany: (args: unknown) => spaceFindMany(args),
    },
  },
}));

interface SafeFetchOpts<T> {
  readonly fetch: () => Promise<T>;
  readonly fallback: T;
}
mock.module("@/shared/lib/errors/server", () => ({
  safeFetch: async <T>(opts: SafeFetchOpts<T>): Promise<T> => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  },
  criticalFetch: async <T>(opts: SafeFetchOpts<T>): Promise<T> => opts.fetch(),
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { LOW: "LOW" },
}));

const { getShowcaseSpaces } = await import("@/shared/domain/sections/queries");

function lastFindManyArg(): { where: Record<string, unknown>; take: number } {
  const call = spaceFindMany.mock.calls[0]?.[0];
  if (!call || typeof call !== "object") {
    throw new Error("space.findMany was not called");
  }
  return call as { where: Record<string, unknown>; take: number };
}

describe("getShowcaseSpaces", () => {
  beforeEach(() => {
    spaceFindMany.mockReset();
    spaceFindMany.mockResolvedValue([]);
  });

  test("常に isPublished + isActive gate を使う", async () => {
    await getShowcaseSpaces(6);

    expect(lastFindManyArg().where).toEqual({
      isPublished: true,
      isActive: true,
    });
    expect(lastFindManyArg().take).toBe(6);
  });
});
