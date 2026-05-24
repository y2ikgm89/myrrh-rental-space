/**
 * ページセクション管理 Server Action 統合テスト
 *
 * テスト内で schema を再定義せず、本番の validation / action export を検証する。
 */

import { describe, expect, test } from "bun:test";
import * as pageSectionActions from "@/admin/actions/page-section";
import {
  createSectionSchema,
  updateSectionContentSchema,
  updateSectionOrderSchema,
} from "@/shared/lib/validations/section";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("PageSection Admin Action Integration", () => {
  describe("現行 action surface", () => {
    test("admin page editor が必要とする CRUD + reorder action を公開する", () => {
      expect(typeof pageSectionActions.updatePageSection).toBe("function");
      expect(typeof pageSectionActions.createPageSection).toBe("function");
      expect(typeof pageSectionActions.deletePageSection).toBe("function");
      expect(typeof pageSectionActions.duplicatePageSection).toBe("function");
      expect(typeof pageSectionActions.togglePageSectionActive).toBe(
        "function",
      );
      expect(typeof pageSectionActions.reorderPageSections).toBe("function");
    });
  });

  describe("updateSectionContentSchema", () => {
    test("config 更新だけを許可する", () => {
      const result = updateSectionContentSchema.safeParse({
        config: { title: "本文" },
      });

      expect(result.success).toBe(true);
    });

    test("タイトル、公開状態更新は本文更新 input として拒否する", () => {
      const result = updateSectionContentSchema.safeParse({
        title: "管理用タイトル",
        isActive: false,
      });

      expect(result.success).toBe(false);
    });
  });

  describe("createSectionSchema", () => {
    test("現行の kebab-case セクションタイプを許可する", () => {
      const result = createSectionSchema.safeParse({
        pageId: VALID_UUID,
        type: "hero",
        config: { title: "Hello" },
        order: 0,
        isActive: true,
      });

      expect(result.success).toBe(true);
    });

    test("旧 Prisma enum 形式の大文字タイプは拒否する", () => {
      const result = createSectionSchema.safeParse({
        pageId: VALID_UUID,
        type: "HERO",
        config: {},
      });

      expect(result.success).toBe(false);
    });
  });

  describe("updateSectionOrderSchema", () => {
    test("重複しない UUID と order の配列を許可する", () => {
      const result = updateSectionOrderSchema.safeParse({
        sections: [
          { id: VALID_UUID, order: 0 },
          { id: VALID_UUID_2, order: 1 },
        ],
      });

      expect(result.success).toBe(true);
    });

    test("同じ ID を複数指定すると拒否する", () => {
      const result = updateSectionOrderSchema.safeParse({
        sections: [
          { id: VALID_UUID, order: 0 },
          { id: VALID_UUID, order: 1 },
        ],
      });

      expect(result.success).toBe(false);
    });
  });
});
