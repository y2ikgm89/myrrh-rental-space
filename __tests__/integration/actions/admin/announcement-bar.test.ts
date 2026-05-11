/**
 * お知らせバー管理 domain 統合テスト
 *
 * source of truth:
 * - src/shared/domain/settings/announcement-bar.ts
 *
 * message は Sanity Portable Text 互換の PortableTextSpan[]
 * （span / iconInline の discriminated union）として保存・編集される。
 */

import { describe, test, expect } from "bun:test";
import {
  announcementBarInputSchema as announcementBarSchema,
  parseAnnouncementBarMessage,
  type AnnouncementBarData,
} from "@/shared/domain/settings/announcement-bar";
import {
  createSpan,
  createInlineIcon,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";

const SAMPLE_MESSAGE: PortableTextSpan[] = [
  createInlineIcon("IconSparkles"),
  createSpan("現在キャンペーン実施中です！"),
];

const VALID_ANNOUNCEMENT_INPUT = {
  message: SAMPLE_MESSAGE,
  linkUrl: "https://example.com/campaign",
  linkText: "詳しくはこちら",
  bgColor: "#FF5733",
  textColor: "#FFFFFF",
  isActive: true,
  priority: 10,
  startAt: "2026-01-01T00:00:00.000Z",
  endAt: "2026-03-31T23:59:59.000Z",
};

describe("AnnouncementBar Admin Action Integration", () => {
  describe("announcementBarSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = announcementBarSchema.safeParse(
          VALID_ANNOUNCEMENT_INPUT,
        );
        expect(result.success).toBe(true);
      });

      test("最小限のデータ（テキスト span のみ）でもバリデーション通過", () => {
        const result = announcementBarSchema.safeParse({
          message: [createSpan("テストメッセージ")],
        });
        expect(result.success).toBe(true);
      });

      test("isActiveのデフォルトはtrue", () => {
        const result = announcementBarSchema.safeParse({
          message: [createSpan("テスト")],
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.isActive).toBe(true);
        }
      });

      test("priorityのデフォルトは0", () => {
        const result = announcementBarSchema.safeParse({
          message: [createSpan("テスト")],
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.priority).toBe(0);
        }
      });

      test("linkUrlはnull許可", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          linkUrl: null,
        });
        expect(result.success).toBe(true);
      });

      test("linkUrlは空文字許可", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          linkUrl: "",
        });
        expect(result.success).toBe(true);
      });

      test("linkTextはnull許可", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          linkText: null,
        });
        expect(result.success).toBe(true);
      });

      test("startAt/endAtはnull許可", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          startAt: null,
          endAt: null,
        });
        expect(result.success).toBe(true);
      });

      test("startAt/endAtはオプション", () => {
        const {
          startAt: _s,
          endAt: _e,
          ...inputWithoutDates
        } = VALID_ANNOUNCEMENT_INPUT;
        const result = announcementBarSchema.safeParse(inputWithoutDates);
        expect(result.success).toBe(true);
      });
    });

    describe("message (PortableTextSpan[])", () => {
      test("テキスト span のみで OK", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          message: [createSpan("お知らせ")],
        });
        expect(result.success).toBe(true);
      });

      test("テキスト + inline icon 混在で OK", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          message: [
            createInlineIcon("IconInfoCircle"),
            createSpan("メンテナンス情報"),
            createInlineIcon("IconSparkles"),
          ],
        });
        expect(result.success).toBe(true);
      });

      test("空配列はエラー（テキスト 1 文字以上必須）", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          message: [],
        });
        expect(result.success).toBe(false);
      });

      test("icon-only（テキスト span ゼロ）はエラー（NN/g 準拠）", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          message: [createInlineIcon("IconSparkles")],
        });
        expect(result.success).toBe(false);
      });

      test("テキスト合計 200 文字までは OK", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          message: [createSpan("x".repeat(200))],
        });
        expect(result.success).toBe(true);
      });

      test("テキスト合計 201 文字以上はエラー", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          message: [createSpan("x".repeat(201))],
        });
        expect(result.success).toBe(false);
      });

      test("無効な icon 名（pattern 不一致）はエラー", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          message: [
            { _key: "k1", _type: "iconInline", name: "invalid-icon" },
            createSpan("テスト"),
          ],
        });
        expect(result.success).toBe(false);
      });

      test("_key 欠落の span はエラー", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          message: [{ _type: "span", text: "テスト" }],
        });
        expect(result.success).toBe(false);
      });
    });

    describe("linkUrl", () => {
      test("有効なURLは許可", () => {
        const validUrls = [
          "https://example.com",
          "https://example.com/path",
          "https://example.com/path?query=1",
        ];
        for (const linkUrl of validUrls) {
          const result = announcementBarSchema.safeParse({
            ...VALID_ANNOUNCEMENT_INPUT,
            linkUrl,
          });
          expect(result.success).toBe(true);
        }
      });

      test("無効なURLはエラー", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          linkUrl: "not-a-url",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("linkText", () => {
      test("50文字のリンクテキストはOK", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          linkText: "あ".repeat(50),
        });
        expect(result.success).toBe(true);
      });

      test("51文字のリンクテキストはエラー", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          linkText: "あ".repeat(51),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain("50文字以内");
        }
      });
    });

    describe("bgColor / textColor", () => {
      test("有効な色コードは許可", () => {
        const validColors = ["#FF5733", "#ffffff", "#000000", "#aaBBcc"];
        for (const bgColor of validColors) {
          const result = announcementBarSchema.safeParse({
            ...VALID_ANNOUNCEMENT_INPUT,
            bgColor,
          });
          expect(result.success).toBe(true);
        }
      });

      test("色コードは小文字に変換される", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          bgColor: "#FF5733",
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.bgColor).toBe("#ff5733");
        }
      });

      test("無効な色コードはエラー", () => {
        const invalidColors = ["#FFF", "red", "#ZZZZZZ", "000000", "#1234567"];
        for (const bgColor of invalidColors) {
          const result = announcementBarSchema.safeParse({
            ...VALID_ANNOUNCEMENT_INPUT,
            bgColor,
          });
          expect(result.success).toBe(false);
        }
      });

      test("bgColorは空文字許可", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          bgColor: "",
        });
        expect(result.success).toBe(true);
      });

      test("bgColorはnull許可", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          bgColor: null,
        });
        expect(result.success).toBe(true);
      });

      test("textColorはnull許可", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          textColor: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("priority", () => {
      test("0は許可", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          priority: 0,
        });
        expect(result.success).toBe(true);
      });

      test("100は許可", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          priority: 100,
        });
        expect(result.success).toBe(true);
      });

      test("負の数はエラー", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          priority: -1,
        });
        expect(result.success).toBe(false);
      });

      test("101はエラー", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          priority: 101,
        });
        expect(result.success).toBe(false);
      });

      test("小数はエラー", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          priority: 1.5,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("isActive", () => {
      test("trueは許可", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          isActive: true,
        });
        expect(result.success).toBe(true);
      });

      test("falseは許可", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          isActive: false,
        });
        expect(result.success).toBe(true);
      });

      test("文字列はエラー", () => {
        const result = announcementBarSchema.safeParse({
          ...VALID_ANNOUNCEMENT_INPUT,
          isActive: "true",
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe("parseAnnouncementBarMessage 読み取り防御", () => {
    test("有効な spans 配列はそのまま narrow", () => {
      const spans: PortableTextSpan[] = [
        createInlineIcon("IconInfoCircle"),
        createSpan("テスト"),
      ];
      const parsed = parseAnnouncementBarMessage(spans);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]?._type).toBe("iconInline");
      expect(parsed[1]?._type).toBe("span");
    });

    test("不正な型は空配列にフォールバック", () => {
      expect(parseAnnouncementBarMessage("旧 plain text")).toEqual([]);
      expect(parseAnnouncementBarMessage(null)).toEqual([]);
      expect(parseAnnouncementBarMessage(undefined)).toEqual([]);
      expect(parseAnnouncementBarMessage({})).toEqual([]);
    });

    test("不正な span 要素を含む配列も空配列にフォールバック（strict）", () => {
      const parsed = parseAnnouncementBarMessage([
        { _type: "unknown", text: "x" },
      ]);
      expect(parsed).toEqual([]);
    });
  });

  describe("AnnouncementBarData型テスト", () => {
    test("AnnouncementBarData型の構造", () => {
      const bar: AnnouncementBarData = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        message: [
          createInlineIcon("IconSparkles"),
          createSpan("キャンペーン実施中"),
        ],
        linkUrl: "https://example.com",
        linkText: "詳しくはこちら",
        bgColor: "#ff5733",
        textColor: "#ffffff",
        isActive: true,
        priority: 10,
        startAt: new Date("2026-01-01"),
        endAt: new Date("2026-03-31"),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(bar.message).toHaveLength(2);
      expect(bar.message[0]?._type).toBe("iconInline");
      expect(bar.priority).toBe(10);
    });
  });

  describe("境界値テスト", () => {
    test("メッセージテキスト 1文字（最小値）", () => {
      const result = announcementBarSchema.safeParse({
        ...VALID_ANNOUNCEMENT_INPUT,
        message: [createSpan("x")],
      });
      expect(result.success).toBe(true);
    });

    test("メッセージテキスト 200文字（境界）", () => {
      const result = announcementBarSchema.safeParse({
        ...VALID_ANNOUNCEMENT_INPUT,
        message: [createSpan("x".repeat(200))],
      });
      expect(result.success).toBe(true);
    });

    test("メッセージテキスト 201文字（境界超過）", () => {
      const result = announcementBarSchema.safeParse({
        ...VALID_ANNOUNCEMENT_INPUT,
        message: [createSpan("x".repeat(201))],
      });
      expect(result.success).toBe(false);
    });

    test("リンクテキスト 50文字（境界）", () => {
      const result = announcementBarSchema.safeParse({
        ...VALID_ANNOUNCEMENT_INPUT,
        linkText: "x".repeat(50),
      });
      expect(result.success).toBe(true);
    });

    test("リンクテキスト 51文字（境界超過）", () => {
      const result = announcementBarSchema.safeParse({
        ...VALID_ANNOUNCEMENT_INPUT,
        linkText: "x".repeat(51),
      });
      expect(result.success).toBe(false);
    });

    test("priority 0（最小値）", () => {
      const result = announcementBarSchema.safeParse({
        ...VALID_ANNOUNCEMENT_INPUT,
        priority: 0,
      });
      expect(result.success).toBe(true);
    });

    test("priority 100（最大値）", () => {
      const result = announcementBarSchema.safeParse({
        ...VALID_ANNOUNCEMENT_INPUT,
        priority: 100,
      });
      expect(result.success).toBe(true);
    });

    test("priority -1（最小値未満）", () => {
      const result = announcementBarSchema.safeParse({
        ...VALID_ANNOUNCEMENT_INPUT,
        priority: -1,
      });
      expect(result.success).toBe(false);
    });

    test("priority 101（最大値超過）", () => {
      const result = announcementBarSchema.safeParse({
        ...VALID_ANNOUNCEMENT_INPUT,
        priority: 101,
      });
      expect(result.success).toBe(false);
    });
  });
});
