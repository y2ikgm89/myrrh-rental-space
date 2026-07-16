import { describe, expect, test } from "bun:test";
import {
  buildEventCalendar,
  buildEventCancelCalendar,
} from "@/shared/lib/ical";

describe("buildEventCalendar (Phase B.1)", () => {
  test("ONLINE: LOCATION=オンライン開催、URL=meetingUrl 出力", () => {
    const cal = buildEventCalendar(
      {
        registrationId: "e1",
        eventTitle: "test",
        customerName: "山田 太郎",
        format: "ONLINE",
        meetingUrl: "https://meet.google.com/abc",
        startTime: new Date("2026-08-01T09:00:00+09:00"),
        endTime: new Date("2026-08-01T10:00:00+09:00"),
        quantity: 1,
        sequence: 0,
        organizerName: "Myrrh",
        organizerEmail: "noreply@example.com",
      },
      "example.com",
    );
    const ics = cal;
    expect(ics).toContain("LOCATION:オンライン開催");
    expect(ics).toContain("URL;VALUE=URI:https://meet.google.com/abc");
  });

  test("OFFLINE: URL 出力なし、LOCATION は物理会場", () => {
    const cal = buildEventCalendar(
      {
        registrationId: "e2",
        eventTitle: "test",
        customerName: "山田 太郎",
        format: "OFFLINE",
        meetingUrl: null,
        location: "東京都渋谷区",
        startTime: new Date("2026-08-01T09:00:00+09:00"),
        endTime: new Date("2026-08-01T10:00:00+09:00"),
        quantity: 1,
        sequence: 0,
        organizerName: "Myrrh",
        organizerEmail: "noreply@example.com",
      },
      "example.com",
    );
    const ics = cal;
    expect(ics).toContain("LOCATION:東京都渋谷区");
    expect(ics).not.toContain("URL:");
  });

  test("HYBRID: LOCATION=物理会場、URL=meetingUrl 両方出力", () => {
    const cal = buildEventCalendar(
      {
        registrationId: "e3",
        eventTitle: "test",
        customerName: "山田 太郎",
        format: "HYBRID",
        meetingUrl: "https://zoom.us/j/123",
        location: "東京都渋谷区",
        startTime: new Date("2026-08-01T09:00:00+09:00"),
        endTime: new Date("2026-08-01T10:00:00+09:00"),
        quantity: 1,
        sequence: 0,
        organizerName: "Myrrh",
        organizerEmail: "noreply@example.com",
      },
      "example.com",
    );
    const ics = cal;
    expect(ics).toContain("LOCATION:東京都渋谷区");
    expect(ics).toContain("URL;VALUE=URI:https://zoom.us/j/123");
  });

  test("ONLINE with CANCEL: LOCATION=オンライン開催 in CANCEL method", () => {
    const cal = buildEventCancelCalendar(
      {
        registrationId: "e4",
        eventTitle: "test",
        customerName: "山田 太郎",
        format: "ONLINE",
        meetingUrl: "https://meet.google.com/xyz",
        startTime: new Date("2026-08-01T09:00:00+09:00"),
        endTime: new Date("2026-08-01T10:00:00+09:00"),
        quantity: 1,
        sequence: 1,
        organizerName: "Myrrh",
        organizerEmail: "noreply@example.com",
      },
      "example.com",
    );
    const ics = cal;
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("LOCATION:オンライン開催");
    expect(ics).toContain("URL;VALUE=URI:https://meet.google.com/xyz");
  });

  test("meetingUrl null for ONLINE should use LOCATION for ONLINE text", () => {
    const cal = buildEventCalendar(
      {
        registrationId: "e5",
        eventTitle: "test",
        customerName: "山田 太郎",
        format: "ONLINE",
        meetingUrl: null,
        startTime: new Date("2026-08-01T09:00:00+09:00"),
        endTime: new Date("2026-08-01T10:00:00+09:00"),
        quantity: 1,
        sequence: 0,
        organizerName: "Myrrh",
        organizerEmail: "noreply@example.com",
      },
      "example.com",
    );
    const ics = cal;
    expect(ics).toContain("LOCATION:オンライン開催");
    expect(ics).not.toContain("URL:");
  });
});
