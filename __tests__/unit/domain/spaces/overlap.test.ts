import { describe, test, expect, mock, beforeEach } from "bun:test";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";

// checkSpaceOverlap の where 句構築を固定化する（旧 checkReservationOverlapQuery の
// overlap.test.ts を継承・拡張。Reservation 側に加えて Event 側の where 句・
// 半開区間境界・exclude-self・チェック順序も pin する）。
// prisma は mock するため where 句の論理は DB が評価するが、overlap 演算子
// （lt/gt、lte/gte でない）を assert することで「隣接予約 = 非重複」境界正当性の
// 回帰（lt→lte でダブルブッキング誤検出）を検出できる。

type ReservationRow = {
  id: string;
  startTime: Date;
  endTime: Date;
};

type EventTimeSlotRow = {
  id: string;
  startAt: Date;
  endAt: Date;
};

const reservationFindFirstMock = mock<
  (args: unknown) => Promise<ReservationRow | null>
>(() => Promise.resolve(null));
const eventTimeSlotFindFirstMock = mock<
  (args: unknown) => Promise<EventTimeSlotRow | null>
>(() => Promise.resolve(null));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: { findFirst: reservationFindFirstMock },
    eventTimeSlot: { findFirst: eventTimeSlotFindFirstMock },
  },
}));

const { checkSpaceOverlap, findOverlappingSlotPair } =
  await import("@/shared/domain/spaces/overlap");

const SPACE_ID = "space-1";
const START = new Date("2026-06-01T01:00:00.000Z");
const END = new Date("2026-06-01T03:00:00.000Z");

describe("checkSpaceOverlap", () => {
  beforeEach(() => {
    reservationFindFirstMock.mockReset();
    reservationFindFirstMock.mockResolvedValue(null);
    eventTimeSlotFindFirstMock.mockReset();
    eventTimeSlotFindFirstMock.mockResolvedValue(null);
  });

  describe("Reservation 側 where 句の構築（境界正当性）", () => {
    test("overlap 条件は startTime<lt:endTime AND endTime>gt:startTime（隣接 = 非重複を保証）", async () => {
      await checkSpaceOverlap({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(reservationFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [{ startTime: { lt: END } }, { endTime: { gt: START } }],
          }),
        }),
      );
    });

    test("spaceId / deletedAt:null / ACTIVE ステータス filter を含む", async () => {
      await checkSpaceOverlap({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(reservationFindFirstMock).toHaveBeenCalledWith(
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
      await checkSpaceOverlap({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
        excludeReservationId: "res-self",
      });

      expect(reservationFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: "res-self" } }),
        }),
      );
    });

    test("excludeReservationId 未指定時は id 条件を含まない（新規予約）", async () => {
      await checkSpaceOverlap({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(reservationFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ id: expect.anything() }),
        }),
      );
    });
  });

  describe("Event (EventTimeSlot) 側 where 句の構築（境界正当性）", () => {
    test("overlap 条件は startAt<lt:endTime AND endAt>gt:startTime（隣接 = 非重複を保証）", async () => {
      await checkSpaceOverlap({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(eventTimeSlotFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [{ startAt: { lt: END } }, { endAt: { gt: START } }],
          }),
        }),
      );
    });

    test("event.spaceId / event.deletedAt:null / ACTIVE_EVENT_STATUSES filter を含む", async () => {
      await checkSpaceOverlap({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(eventTimeSlotFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event: expect.objectContaining({
              spaceId: SPACE_ID,
              deletedAt: null,
              status: { in: [EventStatus.DRAFT, EventStatus.PUBLISHED] },
            }),
          }),
        }),
      );
    });

    test("excludeEventSlotId 指定時は id:{ not } を含む（スロット更新時の自己除外）", async () => {
      await checkSpaceOverlap({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
        excludeEventSlotId: "slot-self",
      });

      expect(eventTimeSlotFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: "slot-self" } }),
        }),
      );
    });

    test("excludeEventId 指定時は event.id:{ not } を含む（自イベント配下スロットの一括除外）", async () => {
      await checkSpaceOverlap({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
        excludeEventId: "event-self",
      });

      expect(eventTimeSlotFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event: expect.objectContaining({ id: { not: "event-self" } }),
          }),
        }),
      );
    });
  });

  describe("戻り値とチェック順序", () => {
    test("双方 overlap なし → { hasOverlap: false }", async () => {
      const result = await checkSpaceOverlap({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(result).toEqual({ hasOverlap: false });
    });

    test("Reservation overlap あり → type:'reservation' で conflictId/startTime/endTime を返す", async () => {
      reservationFindFirstMock.mockResolvedValue({
        id: "res-x",
        startTime: START,
        endTime: END,
      });

      const result = await checkSpaceOverlap({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(result).toEqual({
        hasOverlap: true,
        type: "reservation",
        conflictId: "res-x",
        startTime: START,
        endTime: END,
      });
    });

    test("Reservation overlap がある場合、EventTimeSlot は検査しない（Reservation を先に判定）", async () => {
      reservationFindFirstMock.mockResolvedValue({
        id: "res-x",
        startTime: START,
        endTime: END,
      });

      await checkSpaceOverlap({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(eventTimeSlotFindFirstMock).not.toHaveBeenCalled();
    });

    test("Reservation overlap なし・Event overlap あり → type:'event' で conflictId/startTime/endTime を返す", async () => {
      eventTimeSlotFindFirstMock.mockResolvedValue({
        id: "slot-x",
        startAt: START,
        endAt: END,
      });

      const result = await checkSpaceOverlap({
        spaceId: SPACE_ID,
        startTime: START,
        endTime: END,
      });

      expect(result).toEqual({
        hasOverlap: true,
        type: "event",
        conflictId: "slot-x",
        startTime: START,
        endTime: END,
      });
    });
  });
});

/**
 * `checkSpaceOverlap` が見られない唯一の組 — 同じリクエストで一緒に入ってくる枠どうし。
 *
 * create は自イベントの行がまだ無く、update は `excludeEventId` で自イベントを
 * 母集合から外すので、この重なりは構造上どちらのクエリにも映らない。
 */
describe("findOverlappingSlotPair", () => {
  const at = (hour: number): Date =>
    new Date(`2026-06-01T${String(hour).padStart(2, "0")}:00:00.000Z`);

  test("重なる 2 枠を見つける（開始時刻は違う = @@unique では拾えない形）", () => {
    const first = { startAt: at(10), endAt: at(12) };
    const second = { startAt: at(11), endAt: at(13) };

    expect(findOverlappingSlotPair([first, second])).toEqual({ first, second });
  });

  test("隣接（前の終了 = 次の開始）は重なりではない", () => {
    expect(
      findOverlappingSlotPair([
        { startAt: at(10), endAt: at(12) },
        { startAt: at(12), endAt: at(14) },
      ]),
    ).toBeNull();
  });

  test("入力順に依存しない（後ろの枠が前の枠を包む場合も見つける）", () => {
    const first = { startAt: at(11), endAt: at(12) };
    const second = { startAt: at(9), endAt: at(15) };

    expect(findOverlappingSlotPair([first, second])).toEqual({ first, second });
  });

  test("3 件以上でも、隣り合わない組の重なりを見つける", () => {
    const first = { startAt: at(9), endAt: at(10) };
    const middle = { startAt: at(12), endAt: at(13) };
    const second = { startAt: at(9), endAt: at(11) };

    expect(findOverlappingSlotPair([first, middle, second])).toEqual({
      first,
      second,
    });
  });

  test("0 件・1 件は重なりようがない", () => {
    expect(findOverlappingSlotPair([])).toBeNull();
    expect(
      findOverlappingSlotPair([{ startAt: at(10), endAt: at(12) }]),
    ).toBeNull();
  });
});
