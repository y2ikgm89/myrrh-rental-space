import { describe, test, expect } from "bun:test";

import { blockedDateFormSchema } from "@/shared/lib/validations/blocked-date";

const SPACE_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";

describe("blockedDateFormSchema — scope discriminated union", () => {
  test("SPACE: spaceId あり / locationId なし → OK", () => {
    const result = blockedDateFormSchema.safeParse({
      scope: "SPACE",
      spaceId: SPACE_ID,
      startDate: "2026-12-29",
      endDate: "2027-01-03",
      type: "HOLIDAY",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.spaceId).toBe(SPACE_ID);
      expect(result.data.locationId).toBeNull();
      expect(result.data.reason).toBeNull();
    }
  });

  test("SPACE: spaceId なし → spaceId にエラー", () => {
    const result = blockedDateFormSchema.safeParse({
      scope: "SPACE",
      startDate: "2026-12-29",
      endDate: "2026-12-29",
      type: "HOLIDAY",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "spaceId")).toBe(
        true,
      );
    }
  });

  test("SPACE: locationId も指定 → locationId にエラー", () => {
    const result = blockedDateFormSchema.safeParse({
      scope: "SPACE",
      spaceId: SPACE_ID,
      locationId: LOCATION_ID,
      startDate: "2026-12-29",
      endDate: "2026-12-29",
      type: "HOLIDAY",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "locationId")).toBe(
        true,
      );
    }
  });

  test("LOCATION: locationId あり / spaceId なし → OK", () => {
    const result = blockedDateFormSchema.safeParse({
      scope: "LOCATION",
      locationId: LOCATION_ID,
      startDate: "2026-08-13",
      endDate: "2026-08-16",
      type: "HOLIDAY",
    });
    expect(result.success).toBe(true);
  });

  test("LOCATION: locationId なし → locationId にエラー", () => {
    const result = blockedDateFormSchema.safeParse({
      scope: "LOCATION",
      startDate: "2026-08-13",
      endDate: "2026-08-16",
      type: "HOLIDAY",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "locationId")).toBe(
        true,
      );
    }
  });

  test("GLOBAL: spaceId / locationId なし → OK", () => {
    const result = blockedDateFormSchema.safeParse({
      scope: "GLOBAL",
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      type: "EMERGENCY",
    });
    expect(result.success).toBe(true);
  });

  test("GLOBAL: spaceId 指定 → spaceId にエラー", () => {
    const result = blockedDateFormSchema.safeParse({
      scope: "GLOBAL",
      spaceId: SPACE_ID,
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      type: "EMERGENCY",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "spaceId")).toBe(
        true,
      );
    }
  });
});

describe("blockedDateFormSchema — 日付・正規化", () => {
  test("endDate < startDate → endDate にエラー", () => {
    const result = blockedDateFormSchema.safeParse({
      scope: "GLOBAL",
      startDate: "2026-12-29",
      endDate: "2026-12-01",
      type: "HOLIDAY",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "endDate")).toBe(
        true,
      );
    }
  });

  test("startDate=endDate（単日休業）→ OK", () => {
    const result = blockedDateFormSchema.safeParse({
      scope: "GLOBAL",
      startDate: "2026-12-29",
      endDate: "2026-12-29",
      type: "MAINTENANCE",
    });
    expect(result.success).toBe(true);
  });

  test("不正な日付形式 → エラー", () => {
    const result = blockedDateFormSchema.safeParse({
      scope: "GLOBAL",
      startDate: "2026-13-99",
      endDate: "2026-13-99",
      type: "HOLIDAY",
    });
    expect(result.success).toBe(false);
  });

  test("空文字の spaceId / reason は null に正規化", () => {
    const result = blockedDateFormSchema.safeParse({
      scope: "GLOBAL",
      spaceId: "",
      locationId: "",
      reason: "",
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      type: "OTHER",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.spaceId).toBeNull();
      expect(result.data.locationId).toBeNull();
      expect(result.data.reason).toBeNull();
    }
  });

  test("reason 200文字超 → エラー", () => {
    const result = blockedDateFormSchema.safeParse({
      scope: "GLOBAL",
      reason: "あ".repeat(201),
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      type: "OTHER",
    });
    expect(result.success).toBe(false);
  });

  test("不正な scope → エラー", () => {
    const result = blockedDateFormSchema.safeParse({
      scope: "INVALID",
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      type: "OTHER",
    });
    expect(result.success).toBe(false);
  });
});
