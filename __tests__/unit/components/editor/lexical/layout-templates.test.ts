import { describe, expect, test } from "bun:test";
import {
  getColumnsFromTemplate,
  LAYOUT_BREAKPOINT_MAX_PX,
  LAYOUT_NARROW_TEMPLATES,
  LAYOUT_TEMPLATES,
} from "@/admin/components/editor/lexical/config/layout-templates";

describe("getColumnsFromTemplate", () => {
  test("counts fr tokens", () => {
    expect(getColumnsFromTemplate("1fr 1fr")).toBe(2);
    expect(getColumnsFromTemplate("1fr 1fr 1fr")).toBe(3);
    expect(getColumnsFromTemplate("2fr 1fr")).toBe(2);
  });

  test("trims whitespace", () => {
    expect(getColumnsFromTemplate("  1fr   2fr  ")).toBe(2);
  });

  test("empty or invalid falls back to 1", () => {
    expect(getColumnsFromTemplate("")).toBe(1);
    expect(getColumnsFromTemplate("   ")).toBe(1);
  });
});

describe("LAYOUT_TEMPLATES", () => {
  test("each entry value matches declared column count", () => {
    for (const entry of LAYOUT_TEMPLATES) {
      expect(getColumnsFromTemplate(entry.value)).toBe(entry.columns);
    }
  });
});

describe("LAYOUT_NARROW_TEMPLATES", () => {
  test("each value parses to positive column count", () => {
    for (const entry of LAYOUT_NARROW_TEMPLATES) {
      expect(getColumnsFromTemplate(entry.value)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("LAYOUT_BREAKPOINT_MAX_PX", () => {
  test("matches lexical-content.css layout media query", () => {
    expect(LAYOUT_BREAKPOINT_MAX_PX).toBe(768);
  });
});
