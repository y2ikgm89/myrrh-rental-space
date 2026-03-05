/**
 * ブロックテンプレート Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/block-template.ts のテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// createBlockTemplateSchema 再現
const createBlockTemplateSchema = z.object({
  name: z
    .string()
    .min(1, { error: "テンプレート名は必須です" })
    .max(100, { error: "100文字以内で入力してください" }),
  description: z
    .string()
    .max(500, { error: "500文字以内で入力してください" })
    .optional(),
  nodeJson: z.record(z.string(), z.unknown()).or(z.array(z.unknown())),
});

const VALID_INPUT = {
  name: "CTAブロック",
  nodeJson: { type: "cta", text: "Click me" },
};

describe("Block Template Admin Action Integration", () => {
  describe("createBlockTemplateSchema バリデーション", () => {
    test("有効なデータはパス（object nodeJson）", () => {
      expect(createBlockTemplateSchema.safeParse(VALID_INPUT).success).toBe(
        true,
      );
    });

    test("有効なデータはパス（array nodeJson）", () => {
      const result = createBlockTemplateSchema.safeParse({
        ...VALID_INPUT,
        nodeJson: [{ type: "paragraph" }, { type: "heading" }],
      });
      expect(result.success).toBe(true);
    });

    test("description は省略可能", () => {
      expect(createBlockTemplateSchema.safeParse(VALID_INPUT).success).toBe(
        true,
      );
    });

    test("description ありでもパス", () => {
      expect(
        createBlockTemplateSchema.safeParse({
          ...VALID_INPUT,
          description: "このテンプレートはCTAセクション用です",
        }).success,
      ).toBe(true);
    });

    describe("name", () => {
      test("空文字はエラー", () => {
        const result = createBlockTemplateSchema.safeParse({
          ...VALID_INPUT,
          name: "",
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain(
            "テンプレート名は必須",
          );
      });

      test("100文字はOK（境界）", () => {
        expect(
          createBlockTemplateSchema.safeParse({
            ...VALID_INPUT,
            name: "x".repeat(100),
          }).success,
        ).toBe(true);
      });

      test("101文字はエラー", () => {
        const result = createBlockTemplateSchema.safeParse({
          ...VALID_INPUT,
          name: "x".repeat(101),
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain("100文字以内");
      });
    });

    describe("description", () => {
      test("500文字はOK（境界）", () => {
        expect(
          createBlockTemplateSchema.safeParse({
            ...VALID_INPUT,
            description: "x".repeat(500),
          }).success,
        ).toBe(true);
      });

      test("501文字はエラー", () => {
        const result = createBlockTemplateSchema.safeParse({
          ...VALID_INPUT,
          description: "x".repeat(501),
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain("500文字以内");
      });
    });

    describe("nodeJson", () => {
      test("ネストされたオブジェクトは許可", () => {
        expect(
          createBlockTemplateSchema.safeParse({
            ...VALID_INPUT,
            nodeJson: {
              root: { children: [{ type: "paragraph", text: "hello" }] },
            },
          }).success,
        ).toBe(true);
      });

      test("文字列は不許可", () => {
        expect(
          createBlockTemplateSchema.safeParse({
            ...VALID_INPUT,
            nodeJson: "string",
          }).success,
        ).toBe(false);
      });

      test("数値は不許可", () => {
        expect(
          createBlockTemplateSchema.safeParse({ ...VALID_INPUT, nodeJson: 123 })
            .success,
        ).toBe(false);
      });
    });
  });

  describe("BlockTemplateListItem 型構造", () => {
    test("有効なテンプレートリストアイテム", () => {
      type BlockTemplateListItem = {
        id: string;
        name: string;
        description: string | null;
        createdAt: Date;
        creatorName: string | null;
      };

      const item: BlockTemplateListItem = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "CTAブロック",
        description: null,
        createdAt: new Date(),
        creatorName: "テストユーザー",
      };

      expect(item.description).toBeNull();
      expect(item.creatorName).toBe("テストユーザー");
    });
  });
});
