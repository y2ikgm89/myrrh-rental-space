import { describe, expect, test } from "bun:test";

import {
  CALENDAR_TOKEN_LIFETIME_MS,
  createCalendarToken,
  verifyCalendarToken,
} from "@/shared/lib/calendar/calendar-token";

describe("calendar-token", () => {
  test("発行した予約トークンを同じ種別で検証できる", () => {
    const issuedAt = new Date("2026-06-28T00:00:00.000Z");
    const token = createCalendarToken(
      "reservation",
      "reservation-test-id",
      issuedAt,
    );

    const wire = Buffer.from(token, "base64url").toString("utf8");
    expect(wire).toContain(":calendar-download-reservation:");
    expect(wire).not.toContain(":calendar-download:reservation:");

    expect(
      verifyCalendarToken(
        token,
        "reservation",
        new Date("2026-06-28T00:00:01.000Z"),
      ),
    ).toEqual({
      valid: true,
      kind: "reservation",
      targetId: "reservation-test-id",
      issuedAt: issuedAt.getTime(),
      expiresAt: issuedAt.getTime() + CALENDAR_TOKEN_LIFETIME_MS,
    });
  });

  test("種別が異なるトークンは拒否する", () => {
    const token = createCalendarToken(
      "reservation",
      "reservation-test-id",
      new Date("2026-06-28T00:00:00.000Z"),
    );

    expect(verifyCalendarToken(token, "event")).toEqual({
      valid: false,
      reason: "invalid",
    });
  });

  test("期限切れトークンは拒否する", () => {
    const issuedAt = new Date("2026-06-28T00:00:00.000Z");
    const token = createCalendarToken("event", "event-test-id", issuedAt);

    expect(
      verifyCalendarToken(
        token,
        "event",
        new Date(issuedAt.getTime() + CALENDAR_TOKEN_LIFETIME_MS + 1),
      ),
    ).toEqual({ valid: false, reason: "expired" });
  });
});
