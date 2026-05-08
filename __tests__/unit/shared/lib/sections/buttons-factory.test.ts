/**
 * createButtonsArraySchema factory のユニットテスト
 *
 * 4 sections (cta / hero / hero-parallax / page-hero) で共有される
 * ボタン配列スキーマの contract 検証。label (token 配列) / size / variant /
 * カスタム色 / URL 制約 / uniqueness を網羅。
 */

import { describe, expect, test } from "bun:test";

import { createButtonsArraySchema } from "@/shared/lib/sections/definitions/_shared/buttons";
import {
  createInlineIcon,
  createSpan,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";

const schema = createButtonsArraySchema();

const textOnly: PortableTextSpan[] = [createSpan("予約する")];
const iconPrefixed: PortableTextSpan[] = [
  createInlineIcon("IconArrowRight"),
  createSpan("詳しく見る"),
];

describe("createButtonsArraySchema", () => {
  describe("default / empty array", () => {
    test("undefined は空配列に default される", () => {
      const result = schema.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    test("空配列はそのまま success", () => {
      const result = schema.safeParse([]);
      expect(result.success).toBe(true);
    });
  });

  describe("最小構成", () => {
    test("label + url のみでパース成功（他フィールドは default 補完）", () => {
      const result = schema.safeParse([
        { label: textOnly, url: "/reservation" },
      ]);
      expect(result.success).toBe(true);
      if (result.success && result.data[0]) {
        expect(result.data[0].variant).toBe("primary");
        expect(result.data[0].size).toBe("lg");
        expect(result.data[0].openInNewTab).toBe(false);
      }
    });

    test("label が空配列でも受け付ける（field.richLabel の .default([]) 契約）", () => {
      const result = schema.safeParse([{ label: [], url: "/empty" }]);
      expect(result.success).toBe(true);
    });
  });

  describe("label token 配列", () => {
    test("text token のみ", () => {
      const result = schema.safeParse([{ label: textOnly, url: "/foo" }]);
      expect(result.success).toBe(true);
    });

    test("icon prefix + text 混在 (旧 prefix 配置の token 化)", () => {
      const result = schema.safeParse([{ label: iconPrefixed, url: "/foo" }]);
      expect(result.success).toBe(true);
    });

    test("text 中央 icon 挿入 (新規対応の任意位置)", () => {
      const tokens: PortableTextSpan[] = [
        createSpan("詳しく "),
        createInlineIcon("IconArrowRight"),
        createSpan(" 見る"),
      ];
      const result = schema.safeParse([{ label: tokens, url: "/foo" }]);
      expect(result.success).toBe(true);
    });

    test("不正な icon name (IconXxx 形式違反) は reject", () => {
      const result = schema.safeParse([
        {
          label: [{ _key: "k1", type: "icon", name: "invalid_name" }],
          url: "/foo",
        },
      ]);
      expect(result.success).toBe(false);
    });

    test("不明な token type は reject", () => {
      const result = schema.safeParse([
        {
          label: [{ _key: "k1", type: "emoji", value: "🎉" }],
          url: "/foo",
        },
      ]);
      expect(result.success).toBe(false);
    });
  });

  describe("拡張フィールド", () => {
    test("size: sm/md/lg を受け付ける", () => {
      for (const size of ["sm", "md", "lg"] as const) {
        const result = schema.safeParse([
          { label: textOnly, url: "/test", size },
        ]);
        expect(result.success).toBe(true);
      }
    });

    test("不正な size は reject", () => {
      const result = schema.safeParse([
        { label: textOnly, url: "/test", size: "huge" },
      ]);
      expect(result.success).toBe(false);
    });

    test("variant: primary/secondary/outline/ghost を受け付ける", () => {
      for (const variant of [
        "primary",
        "secondary",
        "outline",
        "ghost",
      ] as const) {
        const result = schema.safeParse([
          { label: textOnly, url: "/test", variant },
        ]);
        expect(result.success).toBe(true);
      }
    });

    test("backgroundColor / textColor は任意のカスタム色（HEX）", () => {
      const result = schema.safeParse([
        {
          label: textOnly,
          url: "/foo",
          backgroundColor: "#1a73e8",
          textColor: "#ffffff",
        },
      ]);
      expect(result.success).toBe(true);
    });

    test("backgroundColor / textColor は空文字を許容", () => {
      const result = schema.safeParse([
        { label: textOnly, url: "/foo", backgroundColor: "", textColor: "" },
      ]);
      expect(result.success).toBe(true);
    });

    test("不正な HEX 色は reject", () => {
      const result = schema.safeParse([
        { label: textOnly, url: "/foo", backgroundColor: "red" },
      ]);
      expect(result.success).toBe(false);
    });
  });

  describe("URL 制約（internal app route only）", () => {
    test("内部パス（/foo）は OK", () => {
      const result = schema.safeParse([{ label: textOnly, url: "/" }]);
      expect(result.success).toBe(true);
    });

    test("外部 URL（https://）は reject", () => {
      const result = schema.safeParse([
        { label: textOnly, url: "https://example.com" },
      ]);
      expect(result.success).toBe(false);
    });

    test("protocol-relative URL は reject", () => {
      const result = schema.safeParse([
        { label: textOnly, url: "//evil.example.com" },
      ]);
      expect(result.success).toBe(false);
    });
  });

  describe("uniqueness 制約", () => {
    test("同じ URL のボタン重複は refine で reject", () => {
      const result = schema.safeParse([
        { label: textOnly, url: "/dup" },
        { label: [createSpan("別")], url: "/dup" },
      ]);
      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues.map((i) => i.message).join(" / ");
        expect(message).toContain("同じURL");
      }
    });

    test("異なる URL なら複数ボタン許容", () => {
      const result = schema.safeParse([
        { label: [createSpan("A")], url: "/a" },
        { label: [createSpan("B")], url: "/b" },
        { label: [createSpan("C")], url: "/c" },
      ]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(3);
      }
    });
  });

  describe("text token 制約", () => {
    test("text value 200 文字超は reject (text token max)", () => {
      const result = schema.safeParse([
        {
          label: [{ _key: "k1", type: "text", value: "a".repeat(201) }],
          url: "/foo",
        },
      ]);
      expect(result.success).toBe(false);
    });
  });
});
