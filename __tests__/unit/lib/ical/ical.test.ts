import { describe, expect, test } from "bun:test";
import {
  buildReservationCalendar,
  buildReservationCancelCalendar,
  buildEventCalendar,
  buildEventCancelCalendar,
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

  test("outputs event times as UTC to avoid server timezone drift", () => {
    const ics = buildReservationCalendar(SAMPLE_RESERVATION, "example.com");
    expect(ics).toContain("DTSTART:20260501T010000Z");
    expect(ics).toContain("DTEND:20260501T030000Z");
    expect(ics).not.toContain("BEGIN:VTIMEZONE");
    expect(ics).not.toContain("TIMEZONE-ID:");
  });

  test("keeps human-facing description in JST", () => {
    const ics = buildReservationCalendar(SAMPLE_RESERVATION, "example.com");
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("日時: 2026/05/01 10:00 - 12:00");
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

  test("includes ORGANIZER when organizerName + organizerEmail provided", () => {
    const ics = buildReservationCalendar(SAMPLE_RESERVATION, "example.com");
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("ORGANIZER");
    expect(unfolded).toContain("Myrrh Rental Space");
    expect(unfolded).toContain("noreply@example.com");
  });

  test("omits ORGANIZER when organizerName or organizerEmail missing", () => {
    const {
      organizerName: _n,
      organizerEmail: _e,
      ...rest
    } = SAMPLE_RESERVATION;
    const ics = buildReservationCalendar(rest, "example.com");
    expect(ics).not.toContain("ORGANIZER");
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
        quantity: 2,
        sequence: 0,
        organizerName: "Myrrh",
        organizerEmail: "noreply@example.com",
        format: "OFFLINE",
        meetingUrl: null,
      },
      "example.com",
    );
    expect(ics).toContain("UID:event-registration-reg-456@example.com");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("DTSTART:20260501T010000Z");
    expect(ics).toContain("DTEND:20260501T030000Z");
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
        quantity: 2,
        sequence: 1,
        organizerName: "Myrrh",
        organizerEmail: "noreply@example.com",
        format: "OFFLINE",
        meetingUrl: null,
      },
      "example.com",
    );
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
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
