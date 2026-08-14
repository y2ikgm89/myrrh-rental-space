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

  test("buildDataStyleRule rejects camelCase property names", () => {
    // 監査 F-15: キーは変換せずそのまま `<style>` へ出るので、camelCase を通すと
    // ブラウザが宣言を丸ごと破棄する。型検査も lint もビルドも通り、
    // **壊れているのは公開画面だけ**という silent bug になる。
    expect(() =>
      buildDataStyleRule("main-shell", {
        marginTop: "calc(var(--header-height, 0px) * -1)",
      }),
    ).toThrow();
  });

  test("buildDataStyleRule allows margin-top for main shell", () => {
    const rule = buildDataStyleRule("main-shell", {
      [CSS_VAR.containerSite]: "72rem",
      "margin-top": "calc(var(--header-height, 0px) * -1)",
    });
    // 監査 F-15: camelCase を出していた頃はブラウザが宣言を破棄していた。
    // 旧テストは壊れた出力を `toContain("marginTop:")` で固定していたため、
    // 直しても直さなくても緑のままだった。
    expect(rule).toContain("margin-top: calc(");
    expect(rule).not.toContain("marginTop");
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
