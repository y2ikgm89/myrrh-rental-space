/**
 * FAQバリデーションテスト
 *
 * src/lib/validations/faq.ts のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import {
  faqCategoryFormSchema,
  faqItemFormSchema,
} from "@/admin/lib/validations/faq";

// 有効なFAQカテゴリデータ
const VALID_FAQ_CATEGORY = {
  name: "よくある質問",
  slug: "general-faq",
  description: "よくある質問カテゴリの説明",
  order: 0,
  isActive: true,
};

// 有効なFAQアイテムデータ
const VALID_FAQ_ITEM = {
  categoryId: "123e4567-e89b-12d3-a456-426614174000",
  question: "これはテスト質問ですか？",
  answer: "はい、これはテスト回答です。",
  order: 0,
  isPublished: true,
};

describe("faqCategoryFormSchema", () => {
  describe("正常系", () => {
    test("有効なデータは検証を通過", () => {
      const result = faqCategoryFormSchema.safeParse(VALID_FAQ_CATEGORY);
      expect(result.success).toBe(true);
    });

    test("descriptionがnullでも許可", () => {
      const result = faqCategoryFormSchema.safeParse({
        ...VALID_FAQ_CATEGORY,
        description: null,
      });
      expect(result.success).toBe(true);
    });

    test("descriptionがundefinedでも許可", () => {
      const { description, ...withoutDescription } = VALID_FAQ_CATEGORY;
      const result = faqCategoryFormSchema.safeParse(withoutDescription);
      expect(result.success).toBe(true);
    });
  });

  describe("name", () => {
    test("空文字はエラー", () => {
      const result = faqCategoryFormSchema.safeParse({
        ...VALID_FAQ_CATEGORY,
        name: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("カテゴリ名");
      }
    });

    test("100文字超過はエラー", () => {
      const result = faqCategoryFormSchema.safeParse({
        ...VALID_FAQ_CATEGORY,
        name: "あ".repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("100文字以内");
      }
    });

    test("100文字ちょうどは許可", () => {
      const result = faqCategoryFormSchema.safeParse({
        ...VALID_FAQ_CATEGORY,
        name: "あ".repeat(100),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("slug", () => {
    test("空文字はエラー", () => {
      const result = faqCategoryFormSchema.safeParse({
        ...VALID_FAQ_CATEGORY,
        slug: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("スラッグ");
      }
    });

    test("100文字超過はエラー", () => {
      const result = faqCategoryFormSchema.safeParse({
        ...VALID_FAQ_CATEGORY,
        slug: "a".repeat(101),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("100文字以内");
      }
    });

    test("無効な文字を含むとエラー", () => {
      const invalidSlugs = ["Test", "test_slug", "test slug", "テスト"];

      for (const slug of invalidSlugs) {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY,
          slug,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain(
            "半角英数字とハイフン",
          );
        }
      }
    });

    test("有効なスラッグ形式", () => {
      const validSlugs = ["general", "general-faq", "faq-123", "123"];

      for (const slug of validSlugs) {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY,
          slug,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("description", () => {
    test("500文字超過はエラー", () => {
      const result = faqCategoryFormSchema.safeParse({
        ...VALID_FAQ_CATEGORY,
        description: "あ".repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("500文字以内");
      }
    });

    test("500文字ちょうどは許可", () => {
      const result = faqCategoryFormSchema.safeParse({
        ...VALID_FAQ_CATEGORY,
        description: "あ".repeat(500),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("order", () => {
    test("負の値はエラー", () => {
      const result = faqCategoryFormSchema.safeParse({
        ...VALID_FAQ_CATEGORY,
        order: -1,
      });
      expect(result.success).toBe(false);
    });

    test("小数はエラー", () => {
      const result = faqCategoryFormSchema.safeParse({
        ...VALID_FAQ_CATEGORY,
        order: 1.5,
      });
      expect(result.success).toBe(false);
    });

    test("0は許可", () => {
      const result = faqCategoryFormSchema.safeParse({
        ...VALID_FAQ_CATEGORY,
        order: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("isActive", () => {
    test("true/falseは許可", () => {
      for (const isActive of [true, false]) {
        const result = faqCategoryFormSchema.safeParse({
          ...VALID_FAQ_CATEGORY,
          isActive,
        });
        expect(result.success).toBe(true);
      }
    });
  });
});

describe("faqItemFormSchema", () => {
  describe("正常系", () => {
    test("有効なデータは検証を通過", () => {
      const result = faqItemFormSchema.safeParse(VALID_FAQ_ITEM);
      expect(result.success).toBe(true);
    });
  });

  describe("categoryId", () => {
    test("無効なUUIDはエラー", () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM,
        categoryId: "invalid-uuid",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("カテゴリを選択");
      }
    });

    test("空文字はエラー", () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM,
        categoryId: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("question", () => {
    test("空文字はエラー", () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM,
        question: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("質問");
      }
    });

    test("500文字超過はエラー", () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM,
        question: "あ".repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("500文字以内");
      }
    });

    test("500文字ちょうどは許可", () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM,
        question: "あ".repeat(500),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("answer", () => {
    test("空文字はエラー", () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM,
        answer: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("回答");
      }
    });

    test("5000文字超過はエラー", () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM,
        answer: "あ".repeat(5001),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("5000文字以内");
      }
    });

    test("5000文字ちょうどは許可", () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM,
        answer: "あ".repeat(5000),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("order", () => {
    test("負の値はエラー", () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM,
        order: -1,
      });
      expect(result.success).toBe(false);
    });

    test("0は許可", () => {
      const result = faqItemFormSchema.safeParse({
        ...VALID_FAQ_ITEM,
        order: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("isPublished", () => {
    test("true/falseは許可", () => {
      for (const isPublished of [true, false]) {
        const result = faqItemFormSchema.safeParse({
          ...VALID_FAQ_ITEM,
          isPublished,
        });
        expect(result.success).toBe(true);
      }
    });
  });
});

// 旧 defaultFaqCategoryFormValues / defaultFaqItemFormValues は Phase 1 Task 6
// conform 移行 (PR for FAQ dialogs) で削除済。新 Dialog は parent component 内で
// inline defaultValue を持つ（mode 別 sub-component に分離されているため定数化
// のメリットがない）。
