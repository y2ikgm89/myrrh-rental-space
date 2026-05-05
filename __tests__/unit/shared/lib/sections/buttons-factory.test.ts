/**
 * createButtonsArraySchema factory のユニットテスト
 *
 * 4 sections (cta/hero/hero-parallax + buttons array consumer) で共有される
 * ボタン配列スキーマの contract 検証。size / iconName / variant / カスタム色まで網羅。
 */

import { describe, expect, test } from "bun:test";

import { createButtonsArraySchema } from "@/shared/lib/sections/definitions/_shared/buttons";

const schema = createButtonsArraySchema();

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
    test("text + url のみでパース成功（他フィールドは default 補完）", () => {
      const result = schema.safeParse([
        { text: "予約する", url: "/reservation" },
      ]);
      expect(result.success).toBe(true);
      if (result.success && result.data[0]) {
        expect(result.data[0].variant).toBe("primary");
        expect(result.data[0].size).toBe("lg");
        expect(result.data[0].openInNewTab).toBe(false);
      }
    });
  });

  describe("拡張フィールド（Phase 2A 追加）", () => {
    test("size: sm/md/lg を受け付ける", () => {
      for (const size of ["sm", "md", "lg"] as const) {
        const result = schema.safeParse([{ text: "Test", url: "/test", size }]);
        expect(result.success).toBe(true);
      }
    });

    test("不正な size は reject", () => {
      const result = schema.safeParse([
        { text: "Test", url: "/test", size: "huge" },
      ]);
      expect(result.success).toBe(false);
    });

    test("iconName は任意の文字列を受け付ける", () => {
      const result = schema.safeParse([
        { text: "進む", url: "/foo", iconName: "IconArrowRight" },
      ]);
      expect(result.success).toBe(true);
    });

    test("variant: primary/secondary/outline/ghost を受け付ける", () => {
      for (const variant of [
        "primary",
        "secondary",
        "outline",
        "ghost",
      ] as const) {
        const result = schema.safeParse([
          { text: "Test", url: "/test", variant },
        ]);
        expect(result.success).toBe(true);
      }
    });

    test("backgroundColor / textColor は任意のカスタム色（HEX）", () => {
      const result = schema.safeParse([
        {
          text: "カスタム色",
          url: "/foo",
          backgroundColor: "#1a73e8",
          textColor: "#ffffff",
        },
      ]);
      expect(result.success).toBe(true);
    });

    test("backgroundColor / textColor は空文字を許容", () => {
      const result = schema.safeParse([
        { text: "未設定色", url: "/foo", backgroundColor: "", textColor: "" },
      ]);
      expect(result.success).toBe(true);
    });

    test("不正な HEX 色は reject", () => {
      const result = schema.safeParse([
        { text: "不正色", url: "/foo", backgroundColor: "red" },
      ]);
      expect(result.success).toBe(false);
    });
  });

  describe("URL 制約（internal app route only）", () => {
    test("内部パス（/foo）は OK", () => {
      const result = schema.safeParse([{ text: "ホーム", url: "/" }]);
      expect(result.success).toBe(true);
    });

    test("外部 URL（https://）は reject", () => {
      const result = schema.safeParse([
        { text: "外部", url: "https://example.com" },
      ]);
      expect(result.success).toBe(false);
    });

    test("protocol-relative URL は reject", () => {
      const result = schema.safeParse([
        { text: "//evil", url: "//evil.example.com" },
      ]);
      expect(result.success).toBe(false);
    });
  });

  describe("uniqueness 制約", () => {
    test("同じ URL のボタン重複は refine で reject", () => {
      const result = schema.safeParse([
        { text: "A", url: "/dup" },
        { text: "B", url: "/dup" },
      ]);
      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues.map((i) => i.message).join(" / ");
        expect(message).toContain("同じURL");
      }
    });

    test("異なる URL なら複数ボタン許容", () => {
      const result = schema.safeParse([
        { text: "A", url: "/a" },
        { text: "B", url: "/b" },
        { text: "C", url: "/c" },
      ]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(3);
      }
    });
  });

  describe("バリデーション", () => {
    test("text が空文字は reject（必須）", () => {
      const result = schema.safeParse([{ text: "", url: "/foo" }]);
      expect(result.success).toBe(false);
    });

    test("text が 50 文字超は reject（maxLength）", () => {
      const result = schema.safeParse([{ text: "a".repeat(51), url: "/foo" }]);
      expect(result.success).toBe(false);
    });
  });
});
