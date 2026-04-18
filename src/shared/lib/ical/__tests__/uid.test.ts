import { describe, expect, test } from "bun:test";
import { buildReservationUid, buildEventRegistrationUid } from "../uid";

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
