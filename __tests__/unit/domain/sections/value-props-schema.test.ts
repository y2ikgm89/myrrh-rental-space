/**
 * value-props セクション schema ユニットテスト
 *
 * Editorial Hairline Strip 用の新スキーマを検証:
 *   - safeParse({}) 成立契約（fallback chain 互換）
 *   - eyebrow フィールドの存在
 *   - items の min: 2 / max: 4 制約（admin write-side 検証）
 *
 * Phase 2 で items[].title は PortableTextSpan[] 化済み（_key + _type: "span" + text）。
 */

import { describe, expect, test } from "bun:test";

import { valuePropsConfigSchema } from "@/shared/lib/sections/definitions/value-props/schema";
import type { PortableTextSpan } from "@/shared/lib/portable-text";

const span = (text: string, key = "k"): PortableTextSpan => ({
  _key: key,
  _type: "span",
  text,
});

const item = (icon: string, eyebrow: string, title: string) => ({
  icon,
  eyebrow,
  title: [span(title)],
});

describe("valuePropsConfigSchema", () => {
  describe("safeParse({}) fallback 契約", () => {
    test("空オブジェクトでも safeParse 成功（default 適用）", () => {
      const result = valuePropsConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toEqual([]);
        expect(result.data.layout).toBeDefined();
      }
    });
  });

  describe("正常系", () => {
    test("4 items（推奨数）でバリデーション成功", () => {
      const result = valuePropsConfigSchema.safeParse({
        items: [
          item("IconClock", "Speed", "最短1時間から"),
          item("IconCalendarCheck", "Flexibility", "当日予約OK"),
          item("IconWifi", "Connectivity", "Wi-Fi完備"),
          item("IconCreditCard", "Payment", "オンライン決済"),
        ],
        layout: {
          padding: "none",
          containerWidth: "lg",
          animateOnScroll: "fade-up",
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(4);
        expect(result.data.items[0]?.eyebrow).toBe("Speed");
      }
    });

    test("2 items（最小値）でバリデーション成功", () => {
      const result = valuePropsConfigSchema.safeParse({
        items: [
          item("IconClock", "Speed", "最短1時間から"),
          item("IconCalendarCheck", "Flexibility", "当日予約OK"),
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(2);
      }
    });

    test("3 items でバリデーション成功", () => {
      const result = valuePropsConfigSchema.safeParse({
        items: [
          item("IconClock", "Speed", "最短1時間から"),
          item("IconCalendarCheck", "Flexibility", "当日予約OK"),
          item("IconWifi", "Connectivity", "Wi-Fi完備"),
        ],
      });
      expect(result.success).toBe(true);
    });

    test("eyebrow が空文字でも各 item の他フィールドが string なら成功", () => {
      const result = valuePropsConfigSchema.safeParse({
        items: [
          item("IconClock", "", "最短1時間から"),
          item("IconCalendarCheck", "", "当日予約OK"),
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("異常系（admin write-side バリデーション）", () => {
    test("1 item は min: 2 違反で失敗", () => {
      const result = valuePropsConfigSchema.safeParse({
        items: [item("IconClock", "Speed", "最短1時間から")],
      });
      expect(result.success).toBe(false);
    });

    test("5 items は max: 4 違反で失敗", () => {
      const result = valuePropsConfigSchema.safeParse({
        items: [
          item("IconClock", "A", "1"),
          item("IconCalendarCheck", "B", "2"),
          item("IconWifi", "C", "3"),
          item("IconCreditCard", "D", "4"),
          item("IconStar", "E", "5"),
        ],
      });
      expect(result.success).toBe(false);
    });

    test("eyebrow が 25 文字以上は max 違反で失敗", () => {
      const longEyebrow = "a".repeat(25);
      const result = valuePropsConfigSchema.safeParse({
        items: [
          item("IconClock", longEyebrow, "最短1時間から"),
          item("IconCalendarCheck", "Flexibility", "当日予約OK"),
        ],
      });
      expect(result.success).toBe(false);
    });

    test("title span text が 501 文字以上は PortableTextSpan max 違反で失敗", () => {
      const longText = "a".repeat(501);
      const result = valuePropsConfigSchema.safeParse({
        items: [
          {
            icon: "IconClock",
            eyebrow: "Speed",
            title: [span(longText)],
          },
          item("IconCalendarCheck", "Flexibility", "当日予約OK"),
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("廃止フィールドの透過処理", () => {
    test("旧 sectionLabel / iconStyle は z.object のデフォルト strip で除去", () => {
      const result = valuePropsConfigSchema.safeParse({
        sectionLabel: "Why Choose Us",
        iconStyle: "tabler",
        items: [
          item("IconClock", "Speed", "最短1時間から"),
          item("IconCalendarCheck", "Flexibility", "当日予約OK"),
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        // 廃止フィールドは出力に含まれない
        expect("sectionLabel" in result.data).toBe(false);
        expect("iconStyle" in result.data).toBe(false);
      }
    });
  });
});
