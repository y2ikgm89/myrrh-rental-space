/**
 * value-props セクション schema ユニットテスト
 *
 * Editorial Hairline Strip 用の新スキーマを検証:
 *   - safeParse({}) 成立契約（fallback chain 互換）
 *   - eyebrow フィールドの存在
 *   - items の min: 2 / max: 4 制約（admin write-side 検証）
 */

import { describe, expect, test } from "bun:test";

import { valuePropsConfigSchema } from "@/shared/lib/sections/definitions/value-props/schema";

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
          { icon: "IconClock", eyebrow: "Speed", title: "最短1時間から" },
          {
            icon: "IconCalendarCheck",
            eyebrow: "Flexibility",
            title: "当日予約OK",
          },
          { icon: "IconWifi", eyebrow: "Connectivity", title: "Wi-Fi完備" },
          {
            icon: "IconCreditCard",
            eyebrow: "Payment",
            title: "オンライン決済",
          },
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
          { icon: "IconClock", eyebrow: "Speed", title: "最短1時間から" },
          {
            icon: "IconCalendarCheck",
            eyebrow: "Flexibility",
            title: "当日予約OK",
          },
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
          { icon: "IconClock", eyebrow: "Speed", title: "最短1時間から" },
          {
            icon: "IconCalendarCheck",
            eyebrow: "Flexibility",
            title: "当日予約OK",
          },
          { icon: "IconWifi", eyebrow: "Connectivity", title: "Wi-Fi完備" },
        ],
      });
      expect(result.success).toBe(true);
    });

    test("eyebrow が空文字でも各 item の他フィールドが string なら成功", () => {
      const result = valuePropsConfigSchema.safeParse({
        items: [
          { icon: "IconClock", eyebrow: "", title: "最短1時間から" },
          { icon: "IconCalendarCheck", eyebrow: "", title: "当日予約OK" },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("異常系（admin write-side バリデーション）", () => {
    test("1 item は min: 2 違反で失敗", () => {
      const result = valuePropsConfigSchema.safeParse({
        items: [
          { icon: "IconClock", eyebrow: "Speed", title: "最短1時間から" },
        ],
      });
      expect(result.success).toBe(false);
    });

    test("5 items は max: 4 違反で失敗", () => {
      const result = valuePropsConfigSchema.safeParse({
        items: [
          { icon: "IconClock", eyebrow: "A", title: "1" },
          { icon: "IconCalendarCheck", eyebrow: "B", title: "2" },
          { icon: "IconWifi", eyebrow: "C", title: "3" },
          { icon: "IconCreditCard", eyebrow: "D", title: "4" },
          { icon: "IconStar", eyebrow: "E", title: "5" },
        ],
      });
      expect(result.success).toBe(false);
    });

    test("eyebrow が 25 文字以上は max 違反で失敗", () => {
      const longEyebrow = "a".repeat(25);
      const result = valuePropsConfigSchema.safeParse({
        items: [
          { icon: "IconClock", eyebrow: longEyebrow, title: "最短1時間から" },
          {
            icon: "IconCalendarCheck",
            eyebrow: "Flexibility",
            title: "当日予約OK",
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    test("title が 31 文字以上は max 違反で失敗", () => {
      const longTitle = "a".repeat(31);
      const result = valuePropsConfigSchema.safeParse({
        items: [
          { icon: "IconClock", eyebrow: "Speed", title: longTitle },
          {
            icon: "IconCalendarCheck",
            eyebrow: "Flexibility",
            title: "当日予約OK",
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("廃止フィールドの透過処理", () => {
    test("旧 sectionLabel / title / iconStyle は z.object のデフォルト strip で除去", () => {
      const result = valuePropsConfigSchema.safeParse({
        sectionLabel: "Why Choose Us",
        title: "サービスの特長",
        iconStyle: "tabler",
        items: [
          { icon: "IconClock", eyebrow: "Speed", title: "最短1時間から" },
          {
            icon: "IconCalendarCheck",
            eyebrow: "Flexibility",
            title: "当日予約OK",
          },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        // 廃止フィールドは出力に含まれない
        expect("sectionLabel" in result.data).toBe(false);
        expect("title" in result.data).toBe(false);
        expect("iconStyle" in result.data).toBe(false);
      }
    });
  });
});
