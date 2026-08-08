import { describe, expect, test } from "bun:test";
import {
  EVENT_FORMAT,
  EVENT_FORMAT_VALUES,
  EVENT_FORMAT_TO_SCHEMA_ORG,
  MEETING_PROVIDER_VALUES,
} from "@/shared/lib/validations/enums/prisma-types";

describe("EVENT_FORMAT", () => {
  test("3 値を持つ", () => {
    expect(EVENT_FORMAT_VALUES).toEqual(["OFFLINE", "ONLINE", "HYBRID"]);
  });
});

describe("EVENT_FORMAT_TO_SCHEMA_ORG", () => {
  test("schema.org eventAttendanceMode と 1:1 mapping (full URL)", () => {
    expect(EVENT_FORMAT_TO_SCHEMA_ORG[EVENT_FORMAT.OFFLINE]).toBe(
      "https://schema.org/OfflineEventAttendanceMode",
    );
    expect(EVENT_FORMAT_TO_SCHEMA_ORG[EVENT_FORMAT.ONLINE]).toBe(
      "https://schema.org/OnlineEventAttendanceMode",
    );
    expect(EVENT_FORMAT_TO_SCHEMA_ORG[EVENT_FORMAT.HYBRID]).toBe(
      "https://schema.org/MixedEventAttendanceMode",
    );
  });

  test("全 EVENT_FORMAT 値が mapping に含まれ、値が schema.org URL である", () => {
    for (const value of EVENT_FORMAT_VALUES) {
      const mapped = EVENT_FORMAT_TO_SCHEMA_ORG[value];
      expect(mapped).toBeString();
      expect(mapped.startsWith("https://schema.org/")).toBe(true);
    }
  });
});

describe("MEETING_PROVIDER", () => {
  test("2 値を持つ", () => {
    expect(MEETING_PROVIDER_VALUES).toEqual(["MANUAL", "GOOGLE_MEET"]);
  });
});
