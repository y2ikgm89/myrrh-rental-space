import { describe, expect, it } from "bun:test";
import { renderTemplate } from "@/shared/lib/email/variables";

describe("renderTemplate", () => {
  it("単純な変数を置換する", () => {
    expect(renderTemplate("Hello {{name}}", { name: "山田" })).toBe(
      "Hello 山田",
    );
  });

  it("複数の変数を置換する", () => {
    expect(renderTemplate("{{a}} and {{b}}", { a: "foo", b: "bar" })).toBe(
      "foo and bar",
    );
  });

  it("同じ変数を複数回置換する", () => {
    expect(renderTemplate("{{x}} {{x}} {{x}}", { x: "Hi" })).toBe("Hi Hi Hi");
  });

  it("未定義の変数は空文字に置換する", () => {
    expect(renderTemplate("Hello {{unknown}}", {})).toBe("Hello ");
  });

  it("変数なしの文字列はそのまま返す", () => {
    expect(renderTemplate("plain text", { x: "y" })).toBe("plain text");
  });

  it("空白を含む placeholder も認識する", () => {
    expect(renderTemplate("{{ name }}", { name: "山田" })).toBe("山田");
  });

  it("ネスト placeholder は literal 扱い", () => {
    expect(
      renderTemplate("{{a.b}}", { "a.b": "nested" } as Record<string, string>),
    ).toBe("nested");
    expect(renderTemplate("{{a.b}}", { a: "x" })).toBe("");
  });

  it("特殊文字を含む値も安全に置換する", () => {
    expect(renderTemplate("{{x}}", { x: "<script>" })).toBe("<script>");
  });

  it("空文字列値は空文字として置換する", () => {
    expect(renderTemplate("Hello {{x}}!", { x: "" })).toBe("Hello !");
  });
});
