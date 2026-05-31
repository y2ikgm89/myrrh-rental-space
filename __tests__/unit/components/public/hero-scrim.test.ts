import { describe, expect, test } from "bun:test";
import { getHeroTextClasses } from "@/app/(public)/_shared/components/page-hero/hero-scrim";

describe("getHeroTextClasses", () => {
  test("dark tone は明文字 + 黒ハロー", () => {
    const c = getHeroTextClasses("dark");
    expect(c.base).toContain("text-background");
    expect(c.title).toContain("text-background");
    expect(c.title).toContain("paint-order:stroke_fill");
    expect(c.title).toContain("rgb(0_0_0/");
  });

  test("light tone は暗文字 + 白ハロー", () => {
    const c = getHeroTextClasses("light");
    expect(c.base).toContain("text-foreground");
    expect(c.title).toContain("text-foreground");
    expect(c.title).toContain("paint-order:stroke_fill");
    expect(c.title).toContain("rgb(255_255_255/");
  });

  test("全要素キーが返る", () => {
    const c = getHeroTextClasses("dark");
    expect(Object.keys(c).sort()).toEqual(
      ["base", "label", "subtitle", "title"].sort(),
    );
  });
});
