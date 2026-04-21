import { describe, expect, test } from "bun:test";
import {
  isAppGeneratedCalendarEvent,
  OUTBOUND_EVENT_MARKER,
  OUTBOUND_RESERVATION_MARKER,
} from "@/shared/lib/calendar-sync/loop-prevention";

describe("OUTBOUND_RESERVATION_MARKER / OUTBOUND_EVENT_MARKER", () => {
  test("固定値で outbound / inbound 両方から SSoT 参照される", () => {
    expect(OUTBOUND_RESERVATION_MARKER).toBe("予約ID:");
    expect(OUTBOUND_EVENT_MARKER).toBe("イベントID:");
  });

  test("2 つのマーカーは相互排他的（片方が他方の prefix にならない）", () => {
    expect(OUTBOUND_RESERVATION_MARKER.startsWith(OUTBOUND_EVENT_MARKER)).toBe(
      false,
    );
    expect(OUTBOUND_EVENT_MARKER.startsWith(OUTBOUND_RESERVATION_MARKER)).toBe(
      false,
    );
  });
});

describe("isAppGeneratedCalendarEvent", () => {
  test("description が null → false（スキップしない）", () => {
    expect(isAppGeneratedCalendarEvent(null)).toBe(false);
  });

  test("description が undefined → false", () => {
    expect(isAppGeneratedCalendarEvent(undefined)).toBe(false);
  });

  test("description が空文字 → false", () => {
    expect(isAppGeneratedCalendarEvent("")).toBe(false);
  });

  test("予約ID: マーカーを含む → true", () => {
    expect(
      isAppGeneratedCalendarEvent("予約ID: ABCD1234\nお客様: 山田太郎"),
    ).toBe(true);
  });

  test("イベントID: マーカーを含む → true", () => {
    expect(
      isAppGeneratedCalendarEvent(
        "イベントID: evt-abc\n公開ページ: https://example.com/events/test",
      ),
    ).toBe(true);
  });

  test("マーカー無しの任意文字列 → false（外部で作られた通常イベント）", () => {
    expect(
      isAppGeneratedCalendarEvent("ミーティング\n参加者: Alice, Bob"),
    ).toBe(false);
  });

  test("マーカーが先頭行でなくても検出する（GCal 上で description を編集された場合の保険）", () => {
    const description = "補足情報\n\n予約ID: DEADBEEF";
    expect(isAppGeneratedCalendarEvent(description)).toBe(true);
  });

  test("両方のマーカーを含む異常ケース → true", () => {
    // 通常発生しないが defensive に true を返す
    const description = "予約ID: ABC\nイベントID: XYZ";
    expect(isAppGeneratedCalendarEvent(description)).toBe(true);
  });

  test("マーカー文字列の部分一致（「予約ID」のみ、コロンなし）→ false", () => {
    // コロン込みの literal マッチ必須
    expect(isAppGeneratedCalendarEvent("予約IDについての注意")).toBe(false);
  });
});
