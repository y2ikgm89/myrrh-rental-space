import { describe, expect, test } from "bun:test";
import { buildDataStyleRule, sanitizeCss } from "@/shared/lib/csp/sanitize-css";
import { CSS_VAR } from "@/shared/lib/csp/css-vars";

describe("sanitize-css", () => {
  test("buildDataStyleRule emits scoped custom properties", () => {
    const rule = buildDataStyleRule("section-1", {
      [CSS_VAR.sectionBgColor]: "#ff0000",
    });
    expect(rule).toBe(
      '[data-style-id="section-1"] { --section-bg-color: #ff0000; }',
    );
    expect(sanitizeCss(rule)).toBe(rule);
  });

  test("buildDataStyleRule allows marginTop for main shell", () => {
    const rule = buildDataStyleRule("main-shell", {
      [CSS_VAR.containerSite]: "72rem",
      marginTop: "calc(var(--header-height, 0px) * -1)",
    });
    expect(rule).toContain("marginTop:");
    expect(sanitizeCss(rule)).toBe(rule);
  });

  test("rejects injection in values", () => {
    expect(() =>
      buildDataStyleRule("x", {
        [CSS_VAR.sectionBgColor]: "red; } body { background: url(",
      }),
    ).toThrow();
  });

  test("rejects unsafe rule shapes in sanitizeCss", () => {
    expect(() => sanitizeCss("body { color: red; }")).toThrow();
  });

  test("empty declarations produce empty rule", () => {
    expect(buildDataStyleRule("empty", {})).toBe("");
  });
});
