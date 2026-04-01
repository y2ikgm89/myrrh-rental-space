import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Prisma モック関数（import より前に定義 — TDZ 回避）
// =============================================================================

const mockBlockTemplateCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "template-1" }),
);

const mockBlockTemplateFindUnique = mock<() => Promise<{ id: string } | null>>(
  () => Promise.resolve(null),
);

const mockBlockTemplateDelete = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    blockTemplate: {
      create: mockBlockTemplateCreate,
      findUnique: mockBlockTemplateFindUnique,
      delete: mockBlockTemplateDelete,
    },
  },
}));

// clonePrismaInputJson モック（Prisma 依存の回避 + DomainError 変換）
mock.module("@/shared/db/json", () => ({
  clonePrismaInputJson: (value: unknown, invalidMessage: string) => {
    let cloned: unknown;
    try {
      cloned = JSON.parse(JSON.stringify(value));
    } catch {
      // DomainError を動的 import なしで生成（循環参照等のシリアライズ失敗）
      const err = new Error(invalidMessage);
      err.name = "DomainError";
      Object.assign(err, { code: "VALIDATION" });
      throw err;
    }
    return cloned;
  },
}));

import {
  createBlockTemplate,
  deleteBlockTemplate,
} from "@/shared/domain/block-template/commands";
import { DomainError } from "@/shared/domain/domain-error";

// テスト用定数
const TEMPLATE_ID = "template-1";
const USER_ID = "user-1";

const VALID_NODE_JSON = {
  root: {
    children: [{ type: "paragraph", children: [] }],
    type: "root",
    version: 1,
  },
};

describe("createBlockTemplate", () => {
  beforeEach(() => {
    mockBlockTemplateCreate.mockReset();
    mockBlockTemplateCreate.mockResolvedValue({ id: TEMPLATE_ID });
  });

  describe("正常系", () => {
    test("有効な入力でテンプレートを作成して id を返す", async () => {
      const result = await createBlockTemplate(
        {
          name: "見出しテンプレート",
          nodeJson: VALID_NODE_JSON,
        },
        USER_ID,
      );

      expect(result).toEqual({ id: TEMPLATE_ID });
      expect(mockBlockTemplateCreate).toHaveBeenCalledTimes(1);
    });

    test("description を含めてテンプレートを作成できる", async () => {
      await createBlockTemplate(
        {
          name: "段落テンプレート",
          description: "よく使う段落のパターン",
          nodeJson: VALID_NODE_JSON,
        },
        USER_ID,
      );

      expect(mockBlockTemplateCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "段落テンプレート",
            description: "よく使う段落のパターン",
            createdBy: USER_ID,
          }),
          select: { id: true },
        }),
      );
    });

    test("description なしで作成すると null になる", async () => {
      await createBlockTemplate(
        {
          name: "シンプルテンプレート",
          nodeJson: VALID_NODE_JSON,
        },
        USER_ID,
      );

      expect(mockBlockTemplateCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });

    test("createdBy に userId が渡される", async () => {
      const anotherUser = "user-99";

      await createBlockTemplate(
        { name: "テスト", nodeJson: VALID_NODE_JSON },
        anotherUser,
      );

      expect(mockBlockTemplateCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdBy: anotherUser,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("シリアライズ不可能な nodeJson（循環参照）はエラーをスローする", async () => {
      // 循環参照オブジェクトはJSONシリアライズ不可
      const circular: Record<string, unknown> = {};
      circular["self"] = circular;

      await expect(
        createBlockTemplate({ name: "循環参照", nodeJson: circular }, USER_ID),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        name: "DomainError",
      });
    });
  });
});

describe("deleteBlockTemplate", () => {
  beforeEach(() => {
    mockBlockTemplateFindUnique.mockReset();
    mockBlockTemplateDelete.mockReset();
    mockBlockTemplateFindUnique.mockResolvedValue(null);
    mockBlockTemplateDelete.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("存在するテンプレートを削除できる", async () => {
      mockBlockTemplateFindUnique.mockResolvedValueOnce({ id: TEMPLATE_ID });

      await expect(deleteBlockTemplate(TEMPLATE_ID)).resolves.toBeUndefined();

      expect(mockBlockTemplateDelete).toHaveBeenCalledTimes(1);
    });

    test("delete が正しい id で呼ばれる", async () => {
      mockBlockTemplateFindUnique.mockResolvedValueOnce({ id: TEMPLATE_ID });

      await deleteBlockTemplate(TEMPLATE_ID);

      expect(mockBlockTemplateDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TEMPLATE_ID },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないテンプレートは NOT_FOUND エラーをスローする", async () => {
      mockBlockTemplateFindUnique.mockResolvedValueOnce(null);

      await expect(deleteBlockTemplate("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "テンプレートが見つかりません",
      });
    });

    test("存在しないテンプレートでは delete が呼ばれない", async () => {
      mockBlockTemplateFindUnique.mockResolvedValueOnce(null);

      await expect(deleteBlockTemplate("non-existent")).rejects.toThrow(
        DomainError,
      );

      expect(mockBlockTemplateDelete).not.toHaveBeenCalled();
    });
  });
});
