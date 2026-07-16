import { describe, expect, test } from "bun:test";
import {
  formatEventVenueDisplay,
  isEventVirtualAccessible,
} from "@/shared/domain/events/venue";

describe("formatEventVenueDisplay", () => {
  test("OFFLINE: primary = 物理会場、secondary = null", () => {
    const result = formatEventVenueDisplay({
      format: "OFFLINE",
      meetingUrl: null,
      location: { name: "渋谷 A" },
      space: { name: "301 号室" },
      addressDetail: null,
    });
    expect(result.primary).toBe("渋谷 A / 301 号室");
    expect(result.secondary).toBeNull();
  });

  test("ONLINE: primary = 'オンライン開催'、secondary = null", () => {
    const result = formatEventVenueDisplay({
      format: "ONLINE",
      meetingUrl: "https://meet.google.com/x",
      location: null,
      space: null,
      addressDetail: null,
    });
    expect(result.primary).toBe("オンライン開催");
    expect(result.secondary).toBeNull();
  });

  test("HYBRID: primary = 物理会場、secondary = 'オンラインでも参加可'", () => {
    const result = formatEventVenueDisplay({
      format: "HYBRID",
      meetingUrl: "https://meet.google.com/x",
      location: { name: "渋谷 A" },
      space: { name: "301 号室" },
      addressDetail: null,
    });
    expect(result.primary).toBe("渋谷 A / 301 号室");
    expect(result.secondary).toBe("オンラインでも参加可");
  });
});

describe("isEventVirtualAccessible", () => {
  test("OFFLINE → false", () => {
    expect(isEventVirtualAccessible({ format: "OFFLINE" })).toBe(false);
  });
  test("ONLINE → true", () => {
    expect(isEventVirtualAccessible({ format: "ONLINE" })).toBe(true);
  });
  test("HYBRID → true", () => {
    expect(isEventVirtualAccessible({ format: "HYBRID" })).toBe(true);
  });
});
