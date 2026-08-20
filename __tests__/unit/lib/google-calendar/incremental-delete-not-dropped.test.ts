/**
 * 増分同期で削除されたイベントが取りこぼされないことを固定する。
 *
 * ## なぜ
 *
 * `fetchCalendarChanges` は「予約システムが作ったイベントか」を
 * `description?.includes("予約ID:")` で振るっていた。
 *
 * **削除だけはこのマーカーで振るえない。** 増分同期（`syncToken` 指定）で
 * 削除されたイベントは最小フィールドだけの resource として返り、
 * `status: "cancelled"` は入るが `description` は入らない。
 * 入口で落とすと削除は 1 件も通らず、しかも `nextSyncToken` は前進するので
 * **二度と再取得されない**。GCal で消された予約が DB では CONFIRMED のまま残り、
 * 枠が塞がったまま顧客への通知も返金も走らない。
 *
 * 「本当に自分たちの予約か」は消費側 `processCalendarChange` が
 * `getReservationByCalendarEventId`（DB の `googleCalendarEventId`）で判定する。
 * そちらが正本なので、無関係なイベントが通っても `not_found` で捨てられる。
 *
 * ## 直し方
 *
 * 落ちたら `sync.ts` の入口条件から `isCancelled` が消えている。マーカーだけに
 * 戻さない — 戻した瞬間に削除が永久欠落する経路へ回帰する。
 */
import { describe, expect, mock, test } from "bun:test";

import { fetchCalendarChanges } from "@/shared/lib/google-calendar/sync";

type ListResponse = {
  data: {
    items: Record<string, unknown>[];
    nextPageToken?: string;
    nextSyncToken?: string;
  };
};

function contextReturning(items: Record<string, unknown>[]) {
  const list = mock<() => Promise<ListResponse>>(() =>
    Promise.resolve({ data: { items, nextSyncToken: "next-token" } }),
  );
  return {
    ctx: {
      client: { events: { list } },
      calendarId: "primary",
    } as unknown as Parameters<typeof fetchCalendarChanges>[0], // test-double
    list,
  };
}

describe("fetchCalendarChanges の削除取りこぼし", () => {
  test("description が無い cancelled イベントも変更として返る", async () => {
    // 増分同期が実際に返す形。id と status しか入らない。
    const { ctx } = contextReturning([
      { id: "evt-deleted", status: "cancelled" },
    ]);

    const result = await fetchCalendarChanges(ctx, "prev-token");

    expect(result.success).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes?.[0]?.eventId).toBe("evt-deleted");
    expect(result.changes?.[0]?.deleted).toBe(true);
  });

  test("マーカー付きの通常イベントは従来どおり返る", async () => {
    const { ctx } = contextReturning([
      {
        id: "evt-updated",
        status: "confirmed",
        description: "予約ID: abc",
        updated: "2026-08-13T00:00:00.000Z",
      },
    ]);

    const result = await fetchCalendarChanges(ctx, "prev-token");

    expect(result.changes).toHaveLength(1);
    expect(result.changes?.[0]?.deleted).toBe(false);
  });

  test("マーカーも cancelled も無いイベントは通さない（入口が緩すぎない）", async () => {
    const { ctx } = contextReturning([
      { id: "evt-foreign", status: "confirmed", description: "社内MTG" },
    ]);

    const result = await fetchCalendarChanges(ctx, "prev-token");

    expect(result.changes).toHaveLength(0);
  });
});
