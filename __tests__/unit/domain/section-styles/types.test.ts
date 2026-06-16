import { describe, test, expect } from "bun:test";
import {
  getDefaultSectionStyle,
  DEFAULT_SECTION_STYLE,
} from "@/shared/domain/section-styles/types";

describe("getDefaultSectionStyle", () => {
  test("未登録 type は DEFAULT_SECTION_STYLE を返す", () => {
    const style = getDefaultSectionStyle("hero");
    expect(style).toBe(DEFAULT_SECTION_STYLE);
  });

  test("DEFAULT_SECTION_STYLE は frozen（runtime mutation 防止）", () => {
    expect(Object.isFrozen(DEFAULT_SECTION_STYLE)).toBe(true);
  });

  test("cta は CTA_SECTION_STYLE（titleSize=xl, textAlign=center, default 背景）", () => {
    const style = getDefaultSectionStyle("cta");
    expect(style.typography.titleSize).toBe("xl");
    expect(style.typography.textAlign).toBe("center");
    expect(style.background.type).toBe("default");
  });

  test("gallery / instagram は FULL_BLEED_STYLE（maxWidth=full, animation=none）", () => {
    for (const type of ["gallery", "instagram"]) {
      const style = getDefaultSectionStyle(type);
      expect(style.container.maxWidth).toBe("full");
      expect(style.animation.preset).toBe("none");
    }
  });

  test("hero-adjacent 系（contact-form / event-calendar / faq-list / location-list / map / news-list / post-list / space-list / space-showcase）は titleSize=lg + maxWidth=xl", () => {
    const heroAdjacent = [
      "contact-form",
      "event-calendar",
      "faq-list",
      "location-list",
      "map",
      "news-list",
      "post-list",
      "space-list",
      "space-showcase",
    ];
    for (const type of heroAdjacent) {
      const style = getDefaultSectionStyle(type);
      expect(style.typography.titleSize).toBe("lg");
      expect(style.container.maxWidth).toBe("xl");
    }
  });

  test("DEFAULT_SECTION_STYLE は maxWidth=xl / textAlign=left / animation=fade", () => {
    expect(DEFAULT_SECTION_STYLE.container.maxWidth).toBe("xl");
    expect(DEFAULT_SECTION_STYLE.typography.textAlign).toBe("left");
    expect(DEFAULT_SECTION_STYLE.animation.preset).toBe("fade");
  });
});
