/**
 * robots.txt 設定 Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/settings/robots-txt.ts のテスト
 * スキーマ・ロジックは schemas.ts から import する
 */

import { describe, test, expect } from "bun:test";
import {
  robotsTxtSettingsSchema,
  checkRobotsTxtWarnings,
} from "@/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas";

describe("robots.txt Settings Admin Action Integration", () => {
  describe("robotsTxtSettingsSchema バリデーション", () => {
    test("有効なデータはパス（無効化）", () => {
      expect(
        robotsTxtSettingsSchema.safeParse({
          robotsTxtEnabled: false,
          robotsTxtCustom: null,
        }).success,
      ).toBe(true);
    });

    test("有効なデータはパス（カスタム robots.txt）", () => {
      expect(
        robotsTxtSettingsSchema.safeParse({
          robotsTxtEnabled: true,
          robotsTxtCustom:
            "User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml",
        }).success,
      ).toBe(true);
    });

    test("robotsTxtEnabled は boolean 必須", () => {
      expect(
        robotsTxtSettingsSchema.safeParse({
          robotsTxtEnabled: "true",
          robotsTxtCustom: null,
        }).success,
      ).toBe(false);
    });

    describe("robotsTxtCustom", () => {
      test("null は許可", () => {
        expect(
          robotsTxtSettingsSchema.safeParse({
            robotsTxtEnabled: false,
            robotsTxtCustom: null,
          }).success,
        ).toBe(true);
      });

      test("10000文字はOK（境界）", () => {
        expect(
          robotsTxtSettingsSchema.safeParse({
            robotsTxtEnabled: true,
            robotsTxtCustom: "x".repeat(10000),
          }).success,
        ).toBe(true);
      });

      test("10001文字はエラー", () => {
        const result = robotsTxtSettingsSchema.safeParse({
          robotsTxtEnabled: true,
          robotsTxtCustom: "x".repeat(10001),
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0]?.message).toContain("10000文字以内");
      });
    });
  });

  describe("checkRobotsTxtWarnings ロジック", () => {
    test("User-agent: * + Disallow: / → サイト全体除外警告", () => {
      const content = "User-agent: *\nDisallow: /";
      const warnings = checkRobotsTxtWarnings(content);
      expect(
        warnings.some((w) => w.includes("サイト全体が検索結果から除外")),
      ).toBe(true);
    });

    test("Sitemap 未指定 → Sitemap 警告", () => {
      const content = "User-agent: *\nDisallow: /admin/";
      const warnings = checkRobotsTxtWarnings(content);
      expect(warnings.some((w) => w.includes("Sitemap"))).toBe(true);
    });

    test("Sitemap 指定済み + 通常 Disallow → 警告なし", () => {
      const content =
        "User-agent: *\nDisallow: /admin/\nSitemap: https://example.com/sitemap.xml";
      const warnings = checkRobotsTxtWarnings(content);
      expect(warnings).toHaveLength(0);
    });

    test("Sitemap 指定済み + 全体 Disallow → サイト全体除外警告のみ", () => {
      const content =
        "User-agent: *\nDisallow: /\nSitemap: https://example.com/sitemap.xml";
      const warnings = checkRobotsTxtWarnings(content);
      expect(
        warnings.some((w) => w.includes("サイト全体が検索結果から除外")),
      ).toBe(true);
      // Sitemap は指定済みなので Sitemap 警告は出ない
      expect(warnings.filter((w) => w.includes("Sitemap"))).toHaveLength(0);
    });

    test("空文字 → Sitemap 警告のみ", () => {
      const warnings = checkRobotsTxtWarnings("");
      expect(warnings.some((w) => w.includes("Sitemap"))).toBe(true);
      expect(
        warnings.filter((w) => w.includes("サイト全体が検索結果から除外")),
      ).toHaveLength(0);
    });

    test("大文字小文字を区別しない（User-Agent: * も検出）", () => {
      const content = "User-Agent: *\nDisallow: /";
      const warnings = checkRobotsTxtWarnings(content);
      expect(
        warnings.some((w) => w.includes("サイト全体が検索結果から除外")),
      ).toBe(true);
    });

    test("Googlebot など特定ユーザーエージェントのみの Disallow / → サイト全体除外警告なし", () => {
      // User-agent: * がない場合は hasWildcardUserAgent = false なので警告なし
      const content =
        "User-agent: Googlebot\nDisallow: /\nSitemap: https://example.com/sitemap.xml";
      const warnings = checkRobotsTxtWarnings(content);
      expect(
        warnings.filter((w) => w.includes("サイト全体が検索結果から除外")),
      ).toHaveLength(0);
    });

    test("User-agent: * の後に Disallow: / が続く場合のみ警告（順序確認）", () => {
      // Disallow: / が先、User-agent: * が後の場合
      const content =
        "Disallow: /\nUser-agent: *\nSitemap: https://example.com/sitemap.xml";
      const warnings = checkRobotsTxtWarnings(content);
      // ループはトップダウンで処理するため Disallow: / は User-agent: * 検出前に現れる
      // この場合 hasWildcardUserAgent = false の状態で Disallow: / に到達するため警告なし
      expect(
        warnings.filter((w) => w.includes("サイト全体が検索結果から除外")),
      ).toHaveLength(0);
    });

    test("複数ルール: User-agent: * ブロックと特定エージェントブロックが混在", () => {
      const content =
        "User-agent: Googlebot\nDisallow: /private/\n\nUser-agent: *\nDisallow: /admin/\nSitemap: https://example.com/sitemap.xml";
      const warnings = checkRobotsTxtWarnings(content);
      // Disallow: / ではなく /admin/ なのでサイト全体除外警告なし
      expect(
        warnings.filter((w) => w.includes("サイト全体が検索結果から除外")),
      ).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    });
  });

  describe("RobotsTxtData 型構造", () => {
    test("有効なデータ構造", () => {
      type RobotsTxtData = {
        robotsTxtEnabled: boolean;
        robotsTxtCustom: string | null;
        defaultRobotsTxt: string;
        warnings: string[];
      };

      const data: RobotsTxtData = {
        robotsTxtEnabled: true,
        robotsTxtCustom:
          "User-agent: *\nSitemap: https://example.com/sitemap.xml",
        defaultRobotsTxt: "User-agent: *\nDisallow:\n",
        warnings: [],
      };

      expect(data.warnings).toHaveLength(0);
      expect(data.defaultRobotsTxt.length).toBeGreaterThan(0);
    });
  });
});
