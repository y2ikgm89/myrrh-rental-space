import { describe, expect, test } from "bun:test";
import {
  sidebarWidgetsSchema,
  sidebarSettingsSchema,
  DEFAULT_SIDEBAR_WIDGETS,
  parseSidebarWidgets,
  tryParseSidebarWidgets,
} from "@/shared/lib/validations/sidebar";

describe("sidebarWidgetsSchema", () => {
  test("validates default widgets array", () => {
    const result = sidebarWidgetsSchema.safeParse(DEFAULT_SIDEBAR_WIDGETS);
    expect(result.success).toBe(true);
  });

  test("validates array with custom widget", () => {
    const widgets = [
      { type: "search", enabled: true },
      { type: "custom", enabled: true, id: "abc123", title: "Contact" },
    ];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(true);
  });

  test("rejects custom widget without id", () => {
    const widgets = [{ type: "custom", enabled: true, title: "No ID" }];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(false);
  });

  test("rejects custom widget without title", () => {
    const widgets = [{ type: "custom", enabled: true, id: "abc" }];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(false);
  });

  test("accepts custom widget with all optional fields", () => {
    const widgets = [
      {
        type: "custom",
        enabled: true,
        id: "abc",
        title: "CTA",
        description: "Some text",
        linkUrl: "/contact",
        linkLabel: "Go",
      },
    ];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(true);
  });

  test("rejects javascript: linkUrl on custom widget", () => {
    const widgets = [
      {
        type: "custom",
        enabled: true,
        id: "abc",
        title: "CTA",
        linkUrl: "javascript:alert(1)",
      },
    ];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(false);
  });

  test("rejects invalid builtin type", () => {
    const widgets = [{ type: "unknown", enabled: true }];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(false);
  });
});

describe("tryParseSidebarWidgets", () => {
  test("valid array を success: true で返す", () => {
    const result = tryParseSidebarWidgets(DEFAULT_SIDEBAR_WIDGETS);
    expect(result).toEqual({ success: true, data: DEFAULT_SIDEBAR_WIDGETS });
  });

  test("invalid data を success: false で返す（フォールバックなし）", () => {
    expect(tryParseSidebarWidgets(null)).toEqual({ success: false });
    expect(tryParseSidebarWidgets("string")).toEqual({ success: false });
    expect(
      tryParseSidebarWidgets([{ type: "unknown", enabled: true }]),
    ).toEqual({ success: false });
  });

  // 空白だけのタイトルは一度きりの正規化 migration で消してある。
  // ここで黙って直さないのは、直すと管理画面の
  // 「保存されているウィジェット設定が不正です」警告が意味を失い、
  // 汚れた行が保存されたまま残り続けるため。読めない構成は読めないと言う。
  test("空白だけのタイトルは failure（読み取り側で黙って直さない）", () => {
    expect(
      tryParseSidebarWidgets([
        { type: "search", enabled: true },
        { type: "custom", enabled: true, id: "a2", title: "   " },
      ]),
    ).toEqual({ success: false });
  });

  test("前後に空白のあるタイトルは正規化して success", () => {
    const result = tryParseSidebarWidgets([
      { type: "custom", enabled: true, id: "a3", title: "  案内  " },
    ]);

    expect(result.success && result.data[0]).toMatchObject({ title: "案内" });
  });
});

describe("parseSidebarWidgets", () => {
  test("parses valid array", () => {
    const result = parseSidebarWidgets(DEFAULT_SIDEBAR_WIDGETS);
    expect(result).toEqual(DEFAULT_SIDEBAR_WIDGETS);
  });

  test("returns default for non-array object input", () => {
    const objectInput = {
      search: true,
      recent: true,
      popular: true,
      categories: true,
      tags: true,
    };
    const result = parseSidebarWidgets(objectInput);
    expect(result).toEqual(DEFAULT_SIDEBAR_WIDGETS);
  });

  test("returns default for null/undefined", () => {
    expect(parseSidebarWidgets(null)).toEqual(DEFAULT_SIDEBAR_WIDGETS);
    expect(parseSidebarWidgets(undefined)).toEqual(DEFAULT_SIDEBAR_WIDGETS);
  });

  test("returns default for invalid data", () => {
    expect(parseSidebarWidgets("string")).toEqual(DEFAULT_SIDEBAR_WIDGETS);
    expect(parseSidebarWidgets(42)).toEqual(DEFAULT_SIDEBAR_WIDGETS);
  });
});

describe("sidebarSettingsSchema", () => {
  const expectedUpdatedAt = new Date("2026-01-15T00:00:00.000Z");

  test("validates complete settings", () => {
    const settings = {
      sidebarEnabled: true,
      sidebarWidgets: DEFAULT_SIDEBAR_WIDGETS,
      sidebarRecentCount: 5,
      sidebarPopularCount: 5,
      sidebarTocEnabled: true,
      expectedUpdatedAt,
    };
    const result = sidebarSettingsSchema.safeParse(settings);
    expect(result.success).toBe(true);
  });

  test("rejects count out of range", () => {
    const settings = {
      sidebarEnabled: true,
      sidebarWidgets: DEFAULT_SIDEBAR_WIDGETS,
      sidebarRecentCount: 0,
      sidebarPopularCount: 21,
      sidebarTocEnabled: true,
      expectedUpdatedAt,
    };
    const result = sidebarSettingsSchema.safeParse(settings);
    expect(result.success).toBe(false);
  });

  test("rejects missing sidebarTocEnabled", () => {
    const settings = {
      sidebarEnabled: true,
      sidebarWidgets: DEFAULT_SIDEBAR_WIDGETS,
      sidebarRecentCount: 5,
      sidebarPopularCount: 5,
      // sidebarTocEnabled 欠落
    };
    const result = sidebarSettingsSchema.safeParse(settings);
    expect(result.success).toBe(false);
  });
});

describe("sidebarWidgetsSchema — recent/popular layout & ranking", () => {
  test("recent widget の layout は省略時に compact がデフォルトで補完される", () => {
    const widgets = [{ type: "recent", enabled: true }];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]).toMatchObject({
        type: "recent",
        enabled: true,
        layout: "compact",
      });
    }
  });

  test("popular widget の layout / showRanking は省略時にデフォルト値が補完される", () => {
    const widgets = [{ type: "popular", enabled: true }];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]).toMatchObject({
        type: "popular",
        enabled: true,
        layout: "compact",
        showRanking: true,
      });
    }
  });

  test("recent widget が layout: stacked を受け付ける", () => {
    const widgets = [{ type: "recent", enabled: true, layout: "stacked" }];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(true);
  });

  test("popular widget が layout: stacked + showRanking: false を受け付ける", () => {
    const widgets = [
      {
        type: "popular",
        enabled: true,
        layout: "stacked",
        showRanking: false,
      },
    ];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(true);
  });

  test("無効な layout 値を拒否する", () => {
    const widgets = [{ type: "recent", enabled: true, layout: "horizontal" }];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(false);
  });
});
