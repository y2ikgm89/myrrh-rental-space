import { describe, expect, it } from "bun:test";
import {
  PAGE_TEMPLATES,
  UNIVERSAL_PAGE_SECTION_TYPES,
  getPageTemplate,
  isAllowedSectionForTemplate,
} from "@/shared/lib/sections/page-templates";
import { getAllSectionDefinitions } from "@/shared/lib/sections/registry";
import {
  DEFAULT_PAGE_SECTIONS,
  createDefaultCustomPageSections,
  type DefaultSectionDef,
} from "@/shared/lib/constants/default-page-sections";
import { keysOf } from "@/shared/lib/serialize";

/**
 * テンプレート id → そのテンプレートで作られるページの slug。
 *
 * 監査 A-88 で `PageTemplate.defaultSections` を削除した際に、この対応が
 * `DEFAULT_PAGE_SECTIONS["about"]` のような形でそのフィールドに埋まっていたことが
 * 分かった（id と slug は一致しない — `content` → `about` など）。
 * 本番コードはこの対応を使わないので、検査側に置く。
 */
const TEMPLATE_PAGE_SLUG: Record<string, string> = {
  home: "home",
  content: "about",
  access: "access",
  contact: "contact",
  faq: "faq",
  "news-archive": "news",
  "blog-archive": "blog",
  "events-archive": "events",
  "spaces-archive": "spaces",
  "terms-archive": "terms",
  reservation: "reservation",
  custom: "custom",
};

/**
 * そのテンプレートでページを作ったときに**実際に DB へ入る**既定セクション。
 *
 * システムページは `system-pages-commands.ts` / `sections/queries.ts` が
 * `DEFAULT_PAGE_SECTIONS[slug]` を、custom ページは `pages/commands.ts` が
 * `createDefaultCustomPageSections(title)` を使う。この 2 つが SSoT。
 */
function seededSectionsFor(templateId: string): readonly DefaultSectionDef[] {
  if (templateId === "custom") {
    return createDefaultCustomPageSections("ページ");
  }
  const slug = TEMPLATE_PAGE_SLUG[templateId];
  if (slug === undefined) {
    throw new Error(
      `テンプレート "${templateId}" のページ slug が TEMPLATE_PAGE_SLUG に無い`,
    );
  }
  return DEFAULT_PAGE_SECTIONS[slug] ?? [];
}

describe("PAGE_TEMPLATES", () => {
  it("contains all 12 expected templates", () => {
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
      "terms-archive",
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

  /**
   * 監査 A-88: 以前は `tpl.defaultSections`（テンプレート側の控え）を見ていたが、
   * 本番の投入経路は `DEFAULT_PAGE_SECTIONS` と `createDefaultCustomPageSections` の
   * 2 つだけで、控えの方は一度も読まれていなかった。**実際に投入される側**を見る。
   */
  it("実際に投入される既定セクションはそのテンプレートで許可されている", () => {
    const templateIds = keysOf(PAGE_TEMPLATES);
    // 走査規模の下限。0 件だとこの test は必ず緑になる。
    expect(templateIds.length).toBeGreaterThan(10);
    // slug 対応が欠けたテンプレートを黙って飛ばさない。
    expect(
      templateIds.filter((id) => TEMPLATE_PAGE_SLUG[id] === undefined),
    ).toEqual([]);

    for (const templateId of templateIds) {
      const tpl = PAGE_TEMPLATES[templateId];
      for (const section of seededSectionsFor(templateId)) {
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

  it("requiredSectionTypes are present in the sections actually seeded (drift gate)", () => {
    // SSoT 分裂回帰防止: 各テンプレートの requiredSectionTypes は、**実際に投入される**
    // 既定セクションに必ず含まれていなければならない。両者がズレるとシード生成直後の
    // 公開ページが「core セクション欠落」状態でレンダリングされる silent bug を引き起こす。
    for (const templateId of keysOf(PAGE_TEMPLATES)) {
      const tpl = PAGE_TEMPLATES[templateId];
      const required = tpl.requiredSectionTypes ?? [];
      const defaultTypes = seededSectionsFor(templateId).map(
        (section) => section.type,
      );
      for (const type of required) {
        expect(
          defaultTypes.includes(type),
          `template "${templateId}" requires section type "${type}" but it is missing from the sections actually seeded ([${defaultTypes.join(", ")}])`,
        ).toBe(true);
      }
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
    // terms-list は terms-archive 専用（他テンプレートに漏れない）
    expect(PAGE_TEMPLATES["faq"]?.allowedSectionTypes).not.toContain(
      "terms-list",
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
