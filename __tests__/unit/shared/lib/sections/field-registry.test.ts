import { describe, expect, it } from "bun:test";
import { z } from "zod";

import { field, fieldRegistry } from "@/shared/lib/sections/field-registry";
import type { FieldMeta } from "@/shared/lib/sections/field-registry";

describe("field-registry", () => {
  describe("field.text", () => {
    it("should register schema with correct metadata", () => {
      const schema = field.text("見出し");
      const meta = fieldRegistry.get(schema);
      expect(meta).toBeDefined();
      expect(meta?.fieldType).toBe("text");
      expect(meta?.label).toBe("見出し");
      expect(meta?.group).toBe("content");
    });

    it("should default group to 'content' when omitted", () => {
      const schema = field.text("テキスト");
      const meta = fieldRegistry.get(schema);
      expect(meta?.group).toBe("content");
    });

    it("should accept explicit group override", () => {
      const schema = field.text("テキスト", { group: "advanced" });
      const meta = fieldRegistry.get(schema);
      expect(meta?.group).toBe("advanced");
    });

    it("should register placeholder when provided", () => {
      const schema = field.text("テキスト", {
        placeholder: "入力してください",
      });
      const meta = fieldRegistry.get(schema);
      expect(meta?.placeholder).toBe("入力してください");
    });

    it("should not include placeholder key when not provided", () => {
      const schema = field.text("テキスト");
      const meta = fieldRegistry.get(schema);
      expect(meta).not.toHaveProperty("placeholder");
    });

    it("should produce a schema with default value", () => {
      const schema = field.text("テキスト", { default: "デフォルト" });
      const parsed = schema.parse(undefined);
      expect(parsed).toBe("デフォルト");
    });
  });

  describe("field.textarea", () => {
    it("should register with fieldType 'textarea'", () => {
      const schema = field.textarea("本文");
      const meta = fieldRegistry.get(schema);
      expect(meta?.fieldType).toBe("textarea");
      expect(meta?.group).toBe("content");
    });
  });

  describe("field.number", () => {
    it("should register with fieldType 'number'", () => {
      const schema = field.number("件数", { min: 1, max: 10, default: 5 });
      const meta = fieldRegistry.get(schema);
      expect(meta?.fieldType).toBe("number");
      expect(meta?.group).toBe("content");
    });

    it("should accept 'advanced' group", () => {
      const schema = field.number("表示件数", {
        min: 1,
        max: 50,
        default: 10,
        group: "advanced",
      });
      const meta = fieldRegistry.get(schema);
      expect(meta?.group).toBe("advanced");
    });

    it("should register suffix when provided", () => {
      const schema = field.number("高さ", { suffix: "svh", group: "design" });
      const meta = fieldRegistry.get(schema);
      expect(meta?.suffix).toBe("svh");
      expect(meta?.group).toBe("design");
    });
  });

  describe("field.boolean", () => {
    it("should register with fieldType 'boolean'", () => {
      const schema = field.boolean("有効化");
      const meta = fieldRegistry.get(schema);
      expect(meta?.fieldType).toBe("boolean");
      expect(meta?.group).toBe("content");
    });
  });

  describe("field.select", () => {
    it("should register with fieldType 'select'", () => {
      const options = ["a", "b", "c"] as const;
      const schema = field.select("バリエーション", { options, default: "a" });
      const meta = fieldRegistry.get(schema);
      expect(meta?.fieldType).toBe("select");
      expect(meta?.group).toBe("content");
    });

    it("should accept 'design' group", () => {
      const options = ["sm", "md", "lg"] as const;
      const schema = field.select("高さ", {
        options,
        default: "md",
        group: "design",
      });
      const meta = fieldRegistry.get(schema);
      expect(meta?.group).toBe("design");
    });
  });

  describe("field.color", () => {
    it("should register with fieldType 'color'", () => {
      const schema = field.color("背景色");
      const meta = fieldRegistry.get(schema);
      expect(meta?.fieldType).toBe("color");
      expect(meta?.group).toBe("content");
    });
  });

  describe("field.image", () => {
    it("should register with fieldType 'image'", () => {
      const schema = field.image("背景画像");
      const meta = fieldRegistry.get(schema);
      expect(meta?.fieldType).toBe("image");
      expect(meta?.group).toBe("content");
    });
  });

  describe("field.url", () => {
    it("should register with fieldType 'url'", () => {
      const schema = field.url("リンク先");
      const meta = fieldRegistry.get(schema);
      expect(meta?.fieldType).toBe("url");
      expect(meta?.group).toBe("content");
    });
  });

  describe("field.icon", () => {
    it("should register with fieldType 'icon'", () => {
      const schema = field.icon("アイコン");
      const meta = fieldRegistry.get(schema);
      expect(meta?.fieldType).toBe("icon");
      expect(meta?.group).toBe("content");
    });
  });

  describe("field.array", () => {
    it("should register with fieldType 'array'", () => {
      const schema = field.array("アイテム", {
        fields: {
          title: field.text("タイトル"),
          description: field.textarea("説明"),
        },
      });
      const meta = fieldRegistry.get(schema);
      expect(meta?.fieldType).toBe("array");
      expect(meta?.group).toBe("content");
    });

    it("should default to empty array", () => {
      const schema = field.array("アイテム", {
        fields: { title: field.text("タイトル") },
      });
      const parsed = schema.parse(undefined);
      expect(parsed).toEqual([]);
    });
  });

  describe("unregistered schema", () => {
    it("should return undefined for plain z.string()", () => {
      const schema = z.string();
      const meta = fieldRegistry.get(schema);
      expect(meta).toBeUndefined();
    });

    it("should return undefined for z.number()", () => {
      const schema = z.number();
      const meta = fieldRegistry.get(schema);
      expect(meta).toBeUndefined();
    });
  });

  describe("FieldMeta type", () => {
    it("should satisfy FieldMeta interface with all required fields", () => {
      const schema = field.text("見出し", {
        helpText: "補足説明",
        group: "design",
      });
      const meta: FieldMeta | undefined = fieldRegistry.get(schema);
      expect(meta).toBeDefined();
      if (meta === undefined) {
        throw new Error("field metadata must be registered");
      }
      expect(meta.fieldType).toBe("text");
      expect(meta.label).toBe("見出し");
      expect(meta.helpText).toBe("補足説明");
      expect(meta.group).toBe("design");
    });
  });
});
