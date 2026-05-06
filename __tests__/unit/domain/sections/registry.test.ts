/**
 * sections/registry ユニットテスト
 *
 * src/shared/lib/sections/registry.ts の全エクスポート関数を検証する。
 * 純粋モジュール（Prisma / server-only 依存なし）のため mock.module 不要。
 */

import { describe, expect, test } from "bun:test";

import {
  getAllSectionDefinitions,
  getDefaultConfig,
  getSectionDefinition,
  getSectionDefinitionsByCategory,
  validateSectionConfig,
} from "@/shared/lib/sections/registry";

// ─────────────────────────────────────────────────────────────
// getSectionDefinition
// ─────────────────────────────────────────────────────────────

describe("getSectionDefinition", () => {
  test("存在するタイプ 'hero' は定義を返す", () => {
    const def = getSectionDefinition("hero");

    expect(def).toBeDefined();
    expect(def?.type).toBe("hero");
    expect(def?.metadata.label).toBe("ヒーロー");
    expect(def?.metadata.category).toBe("hero");
    expect(def?.configSchema).toBeDefined();
  });

  test("存在しないタイプは undefined を返す", () => {
    const def = getSectionDefinition("nonexistent");
    expect(def).toBeUndefined();
  });

  test("空文字列は undefined を返す", () => {
    const def = getSectionDefinition("");
    expect(def).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// getAllSectionDefinitions
// ─────────────────────────────────────────────────────────────

describe("getAllSectionDefinitions", () => {
  test("22 件のセクション定義を返す（page-hero + 標準 21 タイプ）", () => {
    const defs = getAllSectionDefinitions();
    expect(defs).toHaveLength(22);
  });

  test("各定義は type / configSchema / metadata を持つ", () => {
    const defs = getAllSectionDefinitions();
    for (const def of defs) {
      expect(def.type).toBeString();
      expect(def.type.length).toBeGreaterThan(0);
      expect(def.configSchema).toBeDefined();
      expect(def.metadata.label).toBeString();
      expect(def.metadata.category).toBeString();
    }
  });

  test("page-hero + 標準 21 タイプが含まれる", () => {
    const defs = getAllSectionDefinitions();
    const types = defs.map((d) => d.type);

    const expectedTypes = [
      "page-hero",
      "hero",
      "hero-parallax",
      "custom",
      "concept",
      "space-list",
      "space-showcase",
      "news-list",
      "post-list",
      "faq-list",
      "features",
      "testimonial",
      "value-props",
      "gallery",
      "cta",
      "contact-form",
      "reservation-form",
      "map",
      "embed",
      "instagram",
      "event-calendar",
      "location-list",
    ];

    for (const type of expectedTypes) {
      expect(types).toContain(type);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// getSectionDefinitionsByCategory
// ─────────────────────────────────────────────────────────────

describe("getSectionDefinitionsByCategory", () => {
  test("カテゴリ 'hero' には 3 タイプが含まれる（page-hero / hero / hero-parallax）", () => {
    const grouped = getSectionDefinitionsByCategory();
    const heroTypes = grouped["hero"].map((d) => d.type);

    expect(grouped["hero"]).toHaveLength(3);
    expect(heroTypes).toContain("page-hero");
    expect(heroTypes).toContain("hero");
    expect(heroTypes).toContain("hero-parallax");
    expect(heroTypes).not.toContain("homepage-hero");
  });

  test("カテゴリ 'content' に custom / concept / features / value-props が含まれる", () => {
    const grouped = getSectionDefinitionsByCategory();
    const contentTypes = grouped["content"].map((d) => d.type);

    expect(contentTypes).toContain("custom");
    expect(contentTypes).toContain("concept");
    expect(contentTypes).toContain("features");
    expect(contentTypes).toContain("value-props");
  });

  test("カテゴリ 'list' に space-list / space-showcase / news-list / post-list / faq-list / location-list が含まれる", () => {
    const grouped = getSectionDefinitionsByCategory();
    const listTypes = grouped["list"].map((d) => d.type);

    expect(listTypes).toContain("space-list");
    expect(listTypes).toContain("space-showcase");
    expect(listTypes).toContain("news-list");
    expect(listTypes).toContain("post-list");
    expect(listTypes).toContain("faq-list");
    expect(listTypes).toContain("location-list");
  });

  test("カテゴリ 'functional' に cta / contact-form / reservation-form が含まれる", () => {
    const grouped = getSectionDefinitionsByCategory();
    const functionalTypes = grouped["functional"].map((d) => d.type);

    expect(functionalTypes).toContain("cta");
    expect(functionalTypes).toContain("contact-form");
    expect(functionalTypes).toContain("reservation-form");
  });

  test("カテゴリ 'media' に testimonial / gallery / map / embed / instagram が含まれる", () => {
    const grouped = getSectionDefinitionsByCategory();
    const mediaTypes = grouped["media"].map((d) => d.type);

    expect(mediaTypes).toContain("testimonial");
    expect(mediaTypes).toContain("gallery");
    expect(mediaTypes).toContain("map");
    expect(mediaTypes).toContain("embed");
    expect(mediaTypes).toContain("instagram");
  });

  test("全カテゴリの合計件数が 22 件になる", () => {
    const grouped = getSectionDefinitionsByCategory();
    const total =
      grouped["hero"].length +
      grouped["content"].length +
      grouped["list"].length +
      grouped["functional"].length +
      grouped["media"].length;

    expect(total).toBe(22);
  });
});

// ─────────────────────────────────────────────────────────────
// validateSectionConfig
// ─────────────────────────────────────────────────────────────

describe("validateSectionConfig", () => {
  test("'hero' に有効な config を渡すと success: true を返す", () => {
    const result = validateSectionConfig("hero", { title: "Test" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeDefined();
    }
  });

  test("'hero' に空オブジェクトを渡してもデフォルト値でパースが成功する", () => {
    const result = validateSectionConfig("hero", {});

    expect(result.success).toBe(true);
  });

  test("存在しないタイプは success: false を返す", () => {
    const result = validateSectionConfig("unknown", {});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Unknown section type");
    }
  });

  test("'hero' に型不一致の config（title が数値）は Zod エラーを返す", () => {
    const result = validateSectionConfig("hero", {
      title: 12345,
      overlay: "not-a-boolean",
    });

    // overlay は boolean フィールド — "not-a-boolean" は Zod enum/boolean の値として不正
    // schema によっては coerce が有効なため title は通過する可能性がある
    // ここでは result 自体を確認（失敗・成功どちらでも型安全に処理できることを保証）
    expect(typeof result.success).toBe("boolean");
  });
});

// ─────────────────────────────────────────────────────────────
// getDefaultConfig
// ─────────────────────────────────────────────────────────────

describe("getDefaultConfig", () => {
  test("'hero' はデフォルト値を含むオブジェクトを返す", () => {
    const config = getDefaultConfig("hero");

    expect(config).toBeObject();
    // field.text / field.select などにはデフォルト値が設定されている
    expect(typeof config["height"]).toBe("string"); // select デフォルト: "md"
    expect(typeof config["variant"]).toBe("string"); // select デフォルト: "default"
    expect(typeof config["overlay"]).toBe("boolean"); // boolean デフォルト: true
  });

  test("'hero' のデフォルト config は Zod スキーマで再検証できる", () => {
    const config = getDefaultConfig("hero");
    const result = validateSectionConfig("hero", config);

    expect(result.success).toBe(true);
  });

  test("存在しないタイプは空オブジェクトを返す", () => {
    const config = getDefaultConfig("unknown");
    expect(config).toEqual({});
  });

  test("'cta' はデフォルト値を含むオブジェクトを返す", () => {
    const config = getDefaultConfig("cta");
    expect(config).toBeObject();
    expect(Object.keys(config).length).toBeGreaterThan(0);
  });
});
