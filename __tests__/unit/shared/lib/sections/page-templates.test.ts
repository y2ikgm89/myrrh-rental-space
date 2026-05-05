import { describe, expect, it } from "bun:test";
import {
  PAGE_TEMPLATES,
  getPageTemplate,
  isAllowedSectionForTemplate,
} from "@/shared/lib/sections/page-templates";

describe("PAGE_TEMPLATES", () => {
  it("contains all 11 expected templates", () => {
    const expected = [
      "home",
      "content",
      "access",
      "contact",
      "faq",
      "news-archive",
      "blog-archive",
      "events-archive",
      "spaces-archive",
      "reservation",
      "custom",
    ];
    expect(Object.keys(PAGE_TEMPLATES).sort()).toEqual(expected.sort());
  });

  it("each template has non-empty allowedSectionTypes", () => {
    for (const [id, tpl] of Object.entries(PAGE_TEMPLATES)) {
      expect(tpl.allowedSectionTypes.length).toBeGreaterThan(0);
      expect(tpl.id).toBe(id);
    }
  });

  it("requiredSectionTypes is subset of allowedSectionTypes", () => {
    for (const tpl of Object.values(PAGE_TEMPLATES)) {
      const required = tpl.requiredSectionTypes ?? [];
      for (const type of required) {
        expect(tpl.allowedSectionTypes).toContain(type);
      }
    }
  });

  it("defaultSections types are all allowed", () => {
    for (const tpl of Object.values(PAGE_TEMPLATES)) {
      for (const section of tpl.defaultSections) {
        expect(tpl.allowedSectionTypes).toContain(section.type);
      }
    }
  });
});

describe("getPageTemplate", () => {
  it("returns template for known id", () => {
    expect(getPageTemplate("home")?.id).toBe("home");
  });

  it("returns undefined for unknown id", () => {
    expect(getPageTemplate("nonexistent")).toBeUndefined();
  });
});

describe("isAllowedSectionForTemplate", () => {
  it("returns true when type is in allowedSectionTypes", () => {
    expect(isAllowedSectionForTemplate("home", "page-hero")).toBe(true);
  });

  it("returns false when type is not allowed", () => {
    expect(isAllowedSectionForTemplate("contact", "space-list")).toBe(false);
  });

  it("returns false for unknown template", () => {
    expect(isAllowedSectionForTemplate("nonexistent", "page-hero")).toBe(false);
  });
});
