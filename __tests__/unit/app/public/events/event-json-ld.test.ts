/**
 * EventJsonLd（buildEventJsonLdData）単体テスト — Phase B.1 task 15
 *
 * schema.org の 3 format（OFFLINE/ONLINE/HYBRID）に対する eventAttendanceMode
 * の 3 値化 + polymorphic location（Place | VirtualLocation | [Place, VirtualLocation]）
 * の出力形状を検証する。meetingUrl が公開 JSON-LD に一切含まれないことも
 * 全 format で確認する（登録完了者限定、Meetup/Eventbrite 同様のポリシー）。
 */

import { describe, expect, test } from "bun:test";
import {
  buildEventJsonLdData,
  type EventJsonLdProps,
} from "@/app/(public)/events/[slug]/_components/event-json-ld";

const BASE_PROPS: Omit<EventJsonLdProps, "format" | "venue"> = {
  name: "テストイベント",
  description: "説明文",
  startDate: "2026-08-01T10:00:00.000Z",
  endDate: "2026-08-01T12:00:00.000Z",
  url: "https://example.com/events/test-event",
};

const VENUE: NonNullable<EventJsonLdProps["venue"]> = {
  name: "本館",
  address: "東京都渋谷区渋谷1-2-3",
  url: "https://example.com/spaces/honkan",
};

const VIRTUAL_LOCATION_NAME =
  "オンライン開催 (登録完了時に URL をお送りします)";

describe("EventJsonLd (Phase B.1)", () => {
  test("OFFLINE: eventAttendanceMode = OfflineEventAttendanceMode、location = Place", () => {
    const data = buildEventJsonLdData({
      ...BASE_PROPS,
      format: "OFFLINE",
      venue: VENUE,
    });

    expect(data["eventAttendanceMode"]).toBe("OfflineEventAttendanceMode");
    expect(data["location"]).toEqual({
      "@type": "Place",
      name: "本館",
      address: {
        "@type": "PostalAddress",
        streetAddress: "東京都渋谷区渋谷1-2-3",
        addressCountry: "JP",
      },
      url: "https://example.com/spaces/honkan",
    });
  });

  test("OFFLINE: venue 未設定の場合 location key を出力しない", () => {
    const data = buildEventJsonLdData({
      ...BASE_PROPS,
      format: "OFFLINE",
    });

    expect(data["eventAttendanceMode"]).toBe("OfflineEventAttendanceMode");
    expect(data).not.toHaveProperty("location");
  });

  test("ONLINE: eventAttendanceMode = OnlineEventAttendanceMode、location = VirtualLocation (url なし)", () => {
    const data = buildEventJsonLdData({
      ...BASE_PROPS,
      format: "ONLINE",
    });

    expect(data["eventAttendanceMode"]).toBe("OnlineEventAttendanceMode");
    // toEqual は深い完全一致のため、url 等の余分なキーが混入していないことも検証する
    expect(data["location"]).toEqual({
      "@type": "VirtualLocation",
      name: VIRTUAL_LOCATION_NAME,
    });
  });

  test("ONLINE: venue を渡しても物理 Place は出力されない（location は VirtualLocation 単体）", () => {
    const data = buildEventJsonLdData({
      ...BASE_PROPS,
      format: "ONLINE",
      venue: VENUE,
    });

    expect(data["location"]).toEqual({
      "@type": "VirtualLocation",
      name: VIRTUAL_LOCATION_NAME,
    });
  });

  test("HYBRID: eventAttendanceMode = MixedEventAttendanceMode、location = [Place, VirtualLocation]", () => {
    const data = buildEventJsonLdData({
      ...BASE_PROPS,
      format: "HYBRID",
      venue: VENUE,
    });

    expect(data["eventAttendanceMode"]).toBe("MixedEventAttendanceMode");
    expect(data["location"]).toEqual([
      {
        "@type": "Place",
        name: "本館",
        address: {
          "@type": "PostalAddress",
          streetAddress: "東京都渋谷区渋谷1-2-3",
          addressCountry: "JP",
        },
        url: "https://example.com/spaces/honkan",
      },
      {
        "@type": "VirtualLocation",
        name: VIRTUAL_LOCATION_NAME,
      },
    ]);
  });

  test("公開 JSON-LD に meetingUrl は含まれない (全 format)", () => {
    const formats: EventJsonLdProps["format"][] = [
      "OFFLINE",
      "ONLINE",
      "HYBRID",
    ];
    for (const format of formats) {
      const data = buildEventJsonLdData({
        ...BASE_PROPS,
        format,
        venue: VENUE,
      });
      const serialized = JSON.stringify(data);
      expect(serialized).not.toContain("meetingUrl");
      expect(serialized).not.toContain("meet.google.com");
      expect(data).not.toHaveProperty("meetingUrl");
    }
  });
});
