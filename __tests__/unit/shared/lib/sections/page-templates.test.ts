import { describe, expect, it } from "bun:test";
import {
  PAGE_TEMPLATES,
  UNIVERSAL_PAGE_SECTION_TYPES,
  getPageTemplate,
  isAllowedSectionForTemplate,
} from "@/shared/lib/sections/page-templates";
import { getAllSectionDefinitions } from "@/shared/lib/sections/registry";

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

  it("every template includes all universal section types", () => {
    for (const tpl of Object.values(PAGE_TEMPLATES)) {
      for (const type of UNIVERSAL_PAGE_SECTION_TYPES) {
        expect(tpl.allowedSectionTypes).toContain(type);
      }
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

  it("additionalSectionTypes never duplicate universal types (disjoint)", () => {
    const universal = new Set<string>(UNIVERSAL_PAGE_SECTION_TYPES);
    for (const tpl of Object.values(PAGE_TEMPLATES)) {
      for (const type of tpl.additionalSectionTypes) {
        expect(universal.has(type)).toBe(false);
      }
    }
  });

  it("every registered section type is reachable from at least one template (no orphans)", () => {
    const reachable = new Set<string>(UNIVERSAL_PAGE_SECTION_TYPES);
    for (const tpl of Object.values(PAGE_TEMPLATES)) {
      for (const type of tpl.additionalSectionTypes) reachable.add(type);
    }
    for (const def of getAllSectionDefinitions()) {
      expect(reachable.has(def.type)).toBe(true);
    }
  });

  it("page-specific sections are gated to their templates", () => {
    // reservation は space-list / space-showcase を含まない (二重表示防止)
    expect(PAGE_TEMPLATES["reservation"]?.allowedSectionTypes).not.toContain(
      "space-list",
    );
    expect(PAGE_TEMPLATES["reservation"]?.allowedSectionTypes).not.toContain(
      "space-showcase",
    );
    // アーカイブ系の core listing / form は他テンプレートに漏れない
    expect(PAGE_TEMPLATES["faq"]?.allowedSectionTypes).not.toContain(
      "reservation-form",
    );
    expect(PAGE_TEMPLATES["access"]?.allowedSectionTypes).not.toContain(
      "event-calendar",
    );
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

  it("returns true for universal types on focused templates", () => {
    // 改善後: アーカイブ系でも universal セクション (gallery / embed 等) を追加できる
    expect(isAllowedSectionForTemplate("news-archive", "gallery")).toBe(true);
    expect(isAllowedSectionForTemplate("contact", "embed")).toBe(true);
  });

  it("returns false when type is not allowed", () => {
    expect(isAllowedSectionForTemplate("contact", "space-list")).toBe(false);
  });

  it("returns false for unknown template", () => {
    expect(isAllowedSectionForTemplate("nonexistent", "page-hero")).toBe(false);
  });
});
