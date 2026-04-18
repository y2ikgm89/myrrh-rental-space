import { describe, expect, test } from "bun:test";
import {
  buildReservationCalendar,
  buildReservationCancelCalendar,
  buildEventCalendar,
  buildEventCancelCalendar,
  buildICalFeed,
  buildGoogleCalendarUrl,
  buildOutlookWebUrl,
  buildAddToCalendarUrls,
} from "@/shared/lib/ical";

const SAMPLE_RESERVATION = {
  reservationId: "abc-123",
  spaceName: "Studio A",
  customerName: "山田 太郎",
  startTime: new Date("2026-05-01T10:00:00+09:00"),
  endTime: new Date("2026-05-01T12:00:00+09:00"),
  location: "東京都渋谷区...",
  notes: "テスト予約",
  sequence: 0,
  url: "https://example.com/mypage/reservations/abc-123",
  organizerName: "Myrrh Rental Space",
  organizerEmail: "noreply@example.com",
};

describe("buildReservationCalendar", () => {
  test("produces RFC 5545 compliant iCal with stable UID", () => {
    const ics = buildReservationCalendar(SAMPLE_RESERVATION, "example.com");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("UID:reservation-abc-123@example.com");
    expect(ics).toContain("SEQUENCE:0");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("SUMMARY:【予約】Studio A");
    expect(ics).toContain("END:VCALENDAR");
  });

  test("includes VTIMEZONE for Asia/Tokyo", () => {
    const ics = buildReservationCalendar(SAMPLE_RESERVATION, "example.com");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:Asia/Tokyo");
  });

  test("escapes special characters in description", () => {
    const ics = buildReservationCalendar(
      { ...SAMPLE_RESERVATION, notes: "line1\nline2, with; semicolon" },
      "example.com",
    );
    // RFC 5545 folding: long lines are wrapped at 75 chars with CRLF + SPACE.
    // Unfold to verify escape sequences span across fold boundaries.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("line1\\nline2\\, with\\; semicolon");
  });

  test("increments SEQUENCE when passed", () => {
    const ics = buildReservationCalendar(
      { ...SAMPLE_RESERVATION, sequence: 3 },
      "example.com",
    );
    expect(ics).toContain("SEQUENCE:3");
  });
});

describe("buildReservationCancelCalendar", () => {
  test("produces METHOD:CANCEL with STATUS:CANCELLED and same UID", () => {
    const ics = buildReservationCancelCalendar(
      { ...SAMPLE_RESERVATION, sequence: 1 },
      "example.com",
    );
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("UID:reservation-abc-123@example.com");
    expect(ics).toContain("SEQUENCE:1");
  });
});

describe("buildEventCalendar", () => {
  test("produces event ICS with event-registration UID", () => {
    const ics = buildEventCalendar(
      {
        registrationId: "reg-456",
        eventTitle: "ワークショップ",
        customerName: "山田 太郎",
        startTime: new Date("2026-05-01T10:00:00+09:00"),
        endTime: new Date("2026-05-01T12:00:00+09:00"),
        numberOfPeople: 2,
        sequence: 0,
        organizerName: "Myrrh",
        organizerEmail: "noreply@example.com",
      },
      "example.com",
    );
    expect(ics).toContain("UID:event-registration-reg-456@example.com");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("SUMMARY:ワークショップ");
  });
});

describe("buildEventCancelCalendar", () => {
  test("produces METHOD:CANCEL with event-registration UID", () => {
    const ics = buildEventCancelCalendar(
      {
        registrationId: "reg-456",
        eventTitle: "ワークショップ",
        customerName: "山田 太郎",
        startTime: new Date("2026-05-01T10:00:00+09:00"),
        endTime: new Date("2026-05-01T12:00:00+09:00"),
        numberOfPeople: 2,
        sequence: 1,
        organizerName: "Myrrh",
        organizerEmail: "noreply@example.com",
      },
      "example.com",
    );
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
  });
});

describe("buildICalFeed", () => {
  test("produces METHOD:PUBLISH calendar with multiple events", () => {
    const ics = buildICalFeed(
      {
        calendarName: "Studio A - 予約",
        entries: [
          {
            uid: "reservation-1@example.com",
            summary: "【予約】Studio A",
            description: "Test 1",
            startTime: new Date("2026-05-01T10:00:00+09:00"),
            endTime: new Date("2026-05-01T12:00:00+09:00"),
            sequence: 0,
          },
          {
            uid: "reservation-2@example.com",
            summary: "【予約】Studio A",
            description: "Test 2",
            startTime: new Date("2026-05-02T14:00:00+09:00"),
            endTime: new Date("2026-05-02T16:00:00+09:00"),
            sequence: 1,
          },
        ],
      },
      "example.com",
    );
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("X-WR-CALNAME:Studio A - 予約");
    expect(ics).toContain("UID:reservation-1@example.com");
    expect(ics).toContain("UID:reservation-2@example.com");
  });
});

describe("buildGoogleCalendarUrl", () => {
  test("generates TEMPLATE action URL with required params", () => {
    const url = buildGoogleCalendarUrl({
      summary: "Test",
      description: "desc",
      startTime: new Date("2026-05-01T10:00:00Z"),
      endTime: new Date("2026-05-01T12:00:00Z"),
      location: "Tokyo",
    });
    expect(url).toContain("https://calendar.google.com/calendar/render");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=Test");
    expect(url).toMatch(/dates=20260501T100000Z%2F20260501T120000Z/u);
    expect(url).toContain("location=Tokyo");
  });
});

describe("buildOutlookWebUrl", () => {
  test("generates Outlook Live deeplink URL", () => {
    const url = buildOutlookWebUrl({
      summary: "Test",
      description: "desc",
      startTime: new Date("2026-05-01T10:00:00Z"),
      endTime: new Date("2026-05-01T12:00:00Z"),
    });
    expect(url).toContain(
      "https://outlook.live.com/calendar/0/deeplink/compose",
    );
    expect(url).toContain("rru=addevent");
    expect(url).toContain("subject=Test");
  });
});

describe("buildAddToCalendarUrls", () => {
  test("returns all 3 provider URLs", () => {
    const urls = buildAddToCalendarUrls({
      summary: "Test",
      description: "desc",
      startTime: new Date("2026-05-01T10:00:00Z"),
      endTime: new Date("2026-05-01T12:00:00Z"),
      icsDownloadUrl: "https://example.com/api/calendar/reservation/abc-123",
    });
    expect(urls.google).toContain("calendar.google.com");
    expect(urls.outlookWeb).toContain("outlook.live.com");
    expect(urls.ics).toBe(
      "https://example.com/api/calendar/reservation/abc-123",
    );
  });
});
