import { describe, expect, test } from "bun:test";
import { sectionLayoutSchema } from "@/shared/lib/sections/definitions/_shared/layout";

describe("sectionLayoutSchema", () => {
  test("空オブジェクトで全フィールド default 補完", () => {
    const r = sectionLayoutSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.containerWidth).toBe("lg");
      expect(r.data.hideOnMobile).toBe(false);
      expect(r.data.hideOnDesktop).toBe(false);
      expect(r.data.animateOnScroll).toBe("fade-up");
    }
  });

  test("hideOnMobile + hideOnDesktop 両方 true でも valid", () => {
    const r = sectionLayoutSchema.safeParse({
      hideOnMobile: true,
      hideOnDesktop: true,
    });
    expect(r.success).toBe(true);
  });

  test("animateOnScroll: none を許容", () => {
    const r = sectionLayoutSchema.safeParse({ animateOnScroll: "none" });
    expect(r.success).toBe(true);
  });

  test("LAYOUT_CONTAINER_WIDTH_VALUES の全要素を許容", () => {
    for (const cw of ["sm", "md", "lg", "xl", "full"] as const) {
      const r = sectionLayoutSchema.safeParse({ containerWidth: cw });
      expect(r.success).toBe(true);
    }
  });
});
