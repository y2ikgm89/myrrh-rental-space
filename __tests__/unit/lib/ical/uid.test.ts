import { describe, expect, test } from "bun:test";
import {
  buildReservationUid,
  buildEventRegistrationUid,
  buildEventUid,
} from "@/shared/lib/ical/uid";

describe("buildReservationUid", () => {
  test("returns stable uid for same reservationId", () => {
    const uid1 = buildReservationUid("abc-123", "example.com");
    const uid2 = buildReservationUid("abc-123", "example.com");
    expect(uid1).toBe(uid2);
  });

  test("follows RFC 5545 localpart@domain format", () => {
    const uid = buildReservationUid("abc-123", "example.com");
    expect(uid).toBe("reservation-abc-123@example.com");
  });

  test("fallsback to 'localhost' when host is empty", () => {
    const uid = buildReservationUid("abc-123", "");
    expect(uid).toBe("reservation-abc-123@localhost");
  });
});

describe("buildEventRegistrationUid", () => {
  test("follows event-registration-<id>@<host> format", () => {
    const uid = buildEventRegistrationUid("reg-456", "example.com");
    expect(uid).toBe("event-registration-reg-456@example.com");
  });
});

describe("buildEventUid", () => {
  test("follows event-<id>@<host> format", () => {
    const uid = buildEventUid("evt-789", "example.com");
    expect(uid).toBe("event-evt-789@example.com");
  });

  test("fallsback to 'localhost' when host is empty", () => {
    const uid = buildEventUid("evt-789", "");
    expect(uid).toBe("event-evt-789@localhost");
  });

  test("trims whitespace from host", () => {
    const uid = buildEventUid("evt-789", "  example.com  ");
    expect(uid).toBe("event-evt-789@example.com");
  });

  test("has different prefix from buildEventRegistrationUid to avoid collision", () => {
    const eventUid = buildEventUid("abc", "example.com");
    const registrationUid = buildEventRegistrationUid("abc", "example.com");
    expect(eventUid).not.toBe(registrationUid);
    expect(eventUid.startsWith("event-")).toBe(true);
    expect(registrationUid.startsWith("event-registration-")).toBe(true);
  });
});
