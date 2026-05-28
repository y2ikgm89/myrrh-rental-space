import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック（mock.module より先に定義）
const mockBlockedDateFindFirst = mock<
  () => Promise<{ reason: string | null } | null>
>(() => Promise.resolve(null));

const mockSpaceFindUnique = mock<() => Promise<{ locationId: string } | null>>(
  () => Promise.resolve({ locationId: "loc-1" }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    blockedDate: { findFirst: mockBlockedDateFindFirst },
    space: { findUnique: mockSpaceFindUnique },
  },
}));

import {
  isDateBlocked,
  ensureDateNotBlocked,
  getSpaceLocationIdQuery,
} from "@/shared/domain/reservations/availability";
import { DomainError } from "@/shared/domain/domain-error";

const SPACE_ID = "space-1";
const LOCATION_ID = "loc-1";
const DATE = "2026-12-29";

beforeEach(() => {
  mockBlockedDateFindFirst.mockReset();
  mockSpaceFindUnique.mockReset();
  mockBlockedDateFindFirst.mockResolvedValue(null);
  mockSpaceFindUnique.mockResolvedValue({ locationId: LOCATION_ID });
});

describe("isDateBlocked", () => {
  test("該当 blocked date がなければ blocked: false", async () => {
    const result = await isDateBlocked(SPACE_ID, LOCATION_ID, DATE);
    expect(result).toEqual({ blocked: false });
  });

  test("blocked date があれば blocked: true + reason", async () => {
    mockBlockedDateFindFirst.mockResolvedValue({ reason: "年末年始" });
    const result = await isDateBlocked(SPACE_ID, LOCATION_ID, DATE);
    expect(result).toEqual({ blocked: true, reason: "年末年始" });
  });

  test("reason が null でも blocked: true", async () => {
    mockBlockedDateFindFirst.mockResolvedValue({ reason: null });
    const result = await isDateBlocked(SPACE_ID, LOCATION_ID, DATE);
    expect(result).toEqual({ blocked: true, reason: null });
  });

  test("3 階層 cascade の where + UTC 深夜変換 + scope 優先 orderBy", async () => {
    await isDateBlocked(SPACE_ID, LOCATION_ID, DATE);

    const target = new Date("2026-12-29T00:00:00.000Z");
    expect(mockBlockedDateFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startDate: { lte: target },
          endDate: { gte: target },
          OR: [
            { scope: "GLOBAL" },
            { scope: "LOCATION", locationId: LOCATION_ID },
            { scope: "SPACE", spaceId: SPACE_ID },
          ],
        }),
        orderBy: { scope: "asc" },
      }),
    );
  });
});

describe("ensureDateNotBlocked", () => {
  test("blocked でなければ何もしない", async () => {
    await expect(
      ensureDateNotBlocked(SPACE_ID, LOCATION_ID, DATE),
    ).resolves.toBeUndefined();
  });

  test("blocked なら DomainError(CONFLICT) を throw（reason をメッセージに含む）", async () => {
    mockBlockedDateFindFirst.mockResolvedValue({ reason: "設備点検" });
    await expect(
      ensureDateNotBlocked(SPACE_ID, LOCATION_ID, DATE),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("blocked かつ reason null でも DomainError(CONFLICT)", async () => {
    mockBlockedDateFindFirst.mockResolvedValue({ reason: null });
    const error = await ensureDateNotBlocked(SPACE_ID, LOCATION_ID, DATE).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DomainError);
  });
});

describe("getSpaceLocationIdQuery", () => {
  test("スペースが存在すれば locationId を返す", async () => {
    const result = await getSpaceLocationIdQuery(SPACE_ID);
    expect(result).toBe(LOCATION_ID);
  });

  test("スペースが存在しなければ null", async () => {
    mockSpaceFindUnique.mockResolvedValue(null);
    const result = await getSpaceLocationIdQuery(SPACE_ID);
    expect(result).toBeNull();
  });
});
