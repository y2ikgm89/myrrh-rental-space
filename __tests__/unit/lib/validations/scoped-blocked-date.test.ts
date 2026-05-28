import { describe, test, expect } from "bun:test";

import { scopedBlockedDateFormSchema } from "@/admin/lib/validations/blocked-date";

describe("scopedBlockedDateFormSchema", () => {
  test("有効な入力（単日）→ OK", () => {
    const result = scopedBlockedDateFormSchema.safeParse({
      startDate: "2026-12-29",
      endDate: "2026-12-29",
      type: "MAINTENANCE",
      reason: "設備点検",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe("設備点検");
      expect(result.data.type).toBe("MAINTENANCE");
    }
  });

  test("有効な入力（範囲）→ OK", () => {
    const result = scopedBlockedDateFormSchema.safeParse({
      startDate: "2026-12-29",
      endDate: "2027-01-03",
      type: "HOLIDAY",
    });
    expect(result.success).toBe(true);
  });

  test("endDate < startDate → endDate にエラー", () => {
    const result = scopedBlockedDateFormSchema.safeParse({
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

  test("空文字の reason は null に正規化", () => {
    const result = scopedBlockedDateFormSchema.safeParse({
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      type: "OTHER",
      reason: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBeNull();
    }
  });

  test("reason 200文字超 → エラー", () => {
    const result = scopedBlockedDateFormSchema.safeParse({
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      type: "OTHER",
      reason: "あ".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  test("不正な type → エラー", () => {
    const result = scopedBlockedDateFormSchema.safeParse({
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      type: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  test("不正な日付形式 → エラー", () => {
    const result = scopedBlockedDateFormSchema.safeParse({
      startDate: "2026/10/12",
      endDate: "2026-10-12",
      type: "OTHER",
    });
    expect(result.success).toBe(false);
  });
});
