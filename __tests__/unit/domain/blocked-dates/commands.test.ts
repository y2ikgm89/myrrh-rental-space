import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（mock.module より先に定義）
const mockBlockedDateFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

type PrismaWriteArgs = { data: Record<string, unknown>; select?: unknown };

const mockBlockedDateCreate = mock<
  (args: PrismaWriteArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "blocked-1" }));

const mockBlockedDateUpdate = mock<
  (args: PrismaWriteArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "blocked-1" }));

const mockBlockedDateDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "blocked-1" }),
);

const mockSpaceFindUnique = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve({ id: "space-1" }),
);

const mockLocationFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve({ id: "location-1" }));

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    blockedDate: {
      findUnique: mockBlockedDateFindUnique,
      create: mockBlockedDateCreate,
      update: mockBlockedDateUpdate,
      delete: mockBlockedDateDelete,
    },
    space: { findUnique: mockSpaceFindUnique },
    location: { findUnique: mockLocationFindUnique },
  },
}));

import {
  createBlockedDateCommand,
  updateBlockedDateCommand,
  deleteBlockedDateCommand,
} from "@/shared/domain/blocked-dates/commands";
import { DomainError } from "@/shared/domain/domain-error";
import type { BlockedDateFormData } from "@/shared/lib/validations/blocked-date";

const ACTOR = { id: "user-1" };

const SPACE_BLOCKED: BlockedDateFormData = {
  scope: "SPACE",
  spaceId: "11111111-1111-4111-8111-111111111111",
  locationId: null,
  startDate: "2026-12-29",
  endDate: "2027-01-03",
  reason: "年末年始",
  type: "HOLIDAY",
};

const LOCATION_BLOCKED: BlockedDateFormData = {
  scope: "LOCATION",
  spaceId: null,
  locationId: "22222222-2222-4222-8222-222222222222",
  startDate: "2026-08-13",
  endDate: "2026-08-16",
  reason: "お盆休み",
  type: "HOLIDAY",
};

const GLOBAL_BLOCKED: BlockedDateFormData = {
  scope: "GLOBAL",
  spaceId: null,
  locationId: null,
  startDate: "2026-10-12",
  endDate: "2026-10-12",
  reason: "台風による全店休業",
  type: "EMERGENCY",
};

beforeEach(() => {
  mockBlockedDateFindUnique.mockReset();
  mockBlockedDateCreate.mockReset();
  mockBlockedDateUpdate.mockReset();
  mockBlockedDateDelete.mockReset();
  mockSpaceFindUnique.mockReset();
  mockLocationFindUnique.mockReset();

  mockBlockedDateFindUnique.mockResolvedValue({ id: "blocked-1" });
  mockBlockedDateCreate.mockResolvedValue({ id: "blocked-1" });
  mockBlockedDateUpdate.mockResolvedValue({ id: "blocked-1" });
  mockBlockedDateDelete.mockResolvedValue({ id: "blocked-1" });
  mockSpaceFindUnique.mockResolvedValue({ id: "space-1" });
  mockLocationFindUnique.mockResolvedValue({ id: "location-1" });
});

describe("createBlockedDateCommand", () => {
  test("SPACE scope: スペースが存在すれば作成して id を返す", async () => {
    const result = await createBlockedDateCommand(SPACE_BLOCKED, ACTOR);

    expect(result).toEqual({ id: "blocked-1" });
    expect(mockSpaceFindUnique).toHaveBeenCalledTimes(1);
    // "YYYY-MM-DD" は UTC 深夜 Date に変換される
    expect(mockBlockedDateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: "SPACE",
          spaceId: SPACE_BLOCKED.spaceId,
          locationId: null,
          createdBy: "user-1",
          startDate: new Date("2026-12-29T00:00:00.000Z"),
          endDate: new Date("2027-01-03T00:00:00.000Z"),
        }),
      }),
    );
  });

  test("SPACE scope: スペースが存在しなければ NOT_FOUND", async () => {
    mockSpaceFindUnique.mockResolvedValue(null);

    await expect(
      createBlockedDateCommand(SPACE_BLOCKED, ACTOR),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockBlockedDateCreate).not.toHaveBeenCalled();
  });

  test("LOCATION scope: 拠点が存在すれば locationId 付きで作成", async () => {
    const result = await createBlockedDateCommand(LOCATION_BLOCKED, ACTOR);

    expect(result).toEqual({ id: "blocked-1" });
    expect(mockLocationFindUnique).toHaveBeenCalledTimes(1);
    expect(mockBlockedDateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: "LOCATION",
          locationId: LOCATION_BLOCKED.locationId,
          spaceId: null,
        }),
      }),
    );
  });

  test("LOCATION scope: 拠点が存在しなければ NOT_FOUND", async () => {
    mockLocationFindUnique.mockResolvedValue(null);

    await expect(
      createBlockedDateCommand(LOCATION_BLOCKED, ACTOR),
    ).rejects.toBeInstanceOf(DomainError);
    expect(mockBlockedDateCreate).not.toHaveBeenCalled();
  });

  test("GLOBAL scope: 紐づけ対象チェックなしで作成", async () => {
    const result = await createBlockedDateCommand(GLOBAL_BLOCKED, ACTOR);

    expect(result).toEqual({ id: "blocked-1" });
    expect(mockSpaceFindUnique).not.toHaveBeenCalled();
    expect(mockLocationFindUnique).not.toHaveBeenCalled();
    expect(mockBlockedDateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ spaceId: null, locationId: null }),
      }),
    );
  });
});

describe("updateBlockedDateCommand", () => {
  test("存在すれば更新して id を返す", async () => {
    const result = await updateBlockedDateCommand("blocked-1", GLOBAL_BLOCKED);

    expect(result).toEqual({ id: "blocked-1" });
    expect(mockBlockedDateUpdate).toHaveBeenCalledTimes(1);
  });

  test("存在しなければ NOT_FOUND（更新しない）", async () => {
    mockBlockedDateFindUnique.mockResolvedValue(null);

    await expect(
      updateBlockedDateCommand("missing", GLOBAL_BLOCKED),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockBlockedDateUpdate).not.toHaveBeenCalled();
  });
});

describe("deleteBlockedDateCommand", () => {
  test("存在すれば削除して id を返す", async () => {
    const result = await deleteBlockedDateCommand("blocked-1");

    expect(result).toEqual({ id: "blocked-1" });
    expect(mockBlockedDateDelete).toHaveBeenCalledTimes(1);
  });

  test("存在しなければ NOT_FOUND（削除しない）", async () => {
    mockBlockedDateFindUnique.mockResolvedValue(null);

    await expect(deleteBlockedDateCommand("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockBlockedDateDelete).not.toHaveBeenCalled();
  });
});
