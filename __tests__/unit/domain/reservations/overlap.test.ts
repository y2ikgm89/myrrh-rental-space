import { describe, test, expect, mock, beforeEach } from "bun:test";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

// checkReservationOverlapQuery の where 句構築を固定化する。
// prisma は mock するため where 句の論理は DB が評価するが、overlap 演算子
// （lt/gt、lte/gte でない）を assert することで「隣接予約 = 非重複」境界正当性の
// 回帰（lt→lte でダブルブッキング誤検出）を検出できる。

type ConflictRow = {
  id: string;
  startTime: Date;
  endTime: Date;
  status: ReservationStatus;
};

const findFirstMock = mock<(args: unknown) => Promise<ConflictRow | null>>(() =>
  Promise.resolve(null),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: { reservation: { findFirst: findFirstMock } },
}));

const { checkReservationOverlapQuery } =
  await import("@/shared/domain/reservations/availability");

const SPACE_ID = "space-1";
const START = new Date("2026-06-01T01:00:00.000Z");
const END = new Date("2026-06-01T03:00:00.000Z");

describe("checkReservationOverlapQuery", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    findFirstMock.mockResolvedValue(null);
  });

  describe("where 句の構築（境界正当性）", () => {
    test("overlap 条件は startTime<lt:endTime AND endTime>gt:startTime（隣接 = 非重複を保証）", async () => {
      await checkReservationOverlapQuery({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(findFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [{ startTime: { lt: END } }, { endTime: { gt: START } }],
          }),
        }),
      );
    });

    test("spaceId / deletedAt:null / ACTIVE ステータス filter を含む", async () => {
      await checkReservationOverlapQuery({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(findFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            spaceId: SPACE_ID,
            deletedAt: null,
            status: { in: [...ACTIVE_RESERVATION_STATUSES] },
          }),
        }),
      );
    });

    test("excludeReservationId 指定時は id:{ not } を含む（予約変更時の自己除外）", async () => {
      await checkReservationOverlapQuery({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
        excludeReservationId: "res-self",
      });

      expect(findFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: "res-self" } }),
        }),
      );
    });

    test("excludeReservationId 未指定時は id 条件を含まない（新規予約）", async () => {
      await checkReservationOverlapQuery({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(findFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ id: expect.anything() }),
        }),
      );
    });
  });

  describe("戻り値", () => {
    test("overlap なし → { hasOverlap: false }", async () => {
      findFirstMock.mockResolvedValue(null);

      const result = await checkReservationOverlapQuery({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(result).toEqual({ hasOverlap: false });
    });

    test("overlap あり → { hasOverlap: true, conflictingReservation }", async () => {
      const conflict: ConflictRow = {
        id: "res-x",
        startTime: START,
        endTime: END,
        status: ReservationStatus.CONFIRMED,
      };
      findFirstMock.mockResolvedValue(conflict);

      const result = await checkReservationOverlapQuery({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(result).toEqual({
        hasOverlap: true,
        conflictingReservation: conflict,
      });
    });
  });
});
