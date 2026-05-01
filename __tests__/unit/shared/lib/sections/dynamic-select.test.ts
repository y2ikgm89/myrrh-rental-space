/**
 * field.dynamicSelect ヘルパーのユニットテスト
 *
 * Phase 2C で導入された動的 select の contract 検証。
 * meta.dynamicSelectSource が AutoSectionForm 経由で options 注入の判定キーとして機能する。
 */

import { describe, expect, test } from "bun:test";

import { field, fieldRegistry } from "@/shared/lib/sections/field-registry";

describe("field.dynamicSelect", () => {
  describe("post-categories source", () => {
    const schema = field.dynamicSelect("カテゴリ", {
      source: "postCategories",
    });

    test("dynamicSelectSource メタが registry に登録される", () => {
      const meta = fieldRegistry.get(schema);
      expect(meta).toBeDefined();
      expect(meta?.dynamicSelectSource).toBe("postCategories");
      expect(meta?.fieldType).toBe("select");
      expect(meta?.label).toBe("カテゴリ");
    });

    test("空文字（カテゴリ未指定）を許容", () => {
      const result = schema.safeParse("");
      expect(result.success).toBe(true);
    });

    test("UUID を許容", () => {
      const result = schema.safeParse("550e8400-e29b-41d4-a716-446655440000");
      expect(result.success).toBe(true);
    });

    test("非 UUID 文字列は reject", () => {
      const result = schema.safeParse("not-a-uuid");
      expect(result.success).toBe(false);
    });

    test("undefined は default 空文字に補完", () => {
      const result = schema.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("");
      }
    });
  });

  describe("faq-categories source", () => {
    const schema = field.dynamicSelect("FAQ カテゴリ", {
      source: "faqCategories",
      subGroup: "other",
      helpText: "未指定の場合、全カテゴリの FAQ を表示",
    });

    test("dynamicSelectSource: faqCategories で登録される", () => {
      const meta = fieldRegistry.get(schema);
      expect(meta?.dynamicSelectSource).toBe("faqCategories");
    });

    test("subGroup と helpText も meta に保持", () => {
      const meta = fieldRegistry.get(schema);
      expect(meta?.subGroup).toBe("other");
      expect(meta?.helpText).toBe("未指定の場合、全カテゴリの FAQ を表示");
    });
  });

  describe("optional opts", () => {
    test("group / subGroup / helpText を全て省略した場合 default 値が使われる", () => {
      const schema = field.dynamicSelect("最小", {
        source: "postCategories",
      });
      const meta = fieldRegistry.get(schema);
      expect(meta?.group).toBe("content");
      expect(meta?.subGroup).toBeUndefined();
      expect(meta?.helpText).toBeUndefined();
    });

    test("group: design を明示できる（advanced/design 配置の用途）", () => {
      const schema = field.dynamicSelect("デザイン用", {
        source: "postCategories",
        group: "design",
      });
      const meta = fieldRegistry.get(schema);
      expect(meta?.group).toBe("design");
    });
  });
});
