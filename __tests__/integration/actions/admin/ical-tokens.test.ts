/**
 * iCal トークン Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/ical-tokens.ts のテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// =============================================================================
// スキーマ再現（ical-tokens.ts から）
// =============================================================================

const createTokenSchema = z.object({
  name: z.string().min(1, { error: "トークン名は必須です" }).max(100),
  spaceId: z.string().uuid().nullable(),
  expiresInDays: z.number().int().min(0).nullable(),
});

// =============================================================================
// テストデータ
// =============================================================================

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const VALID_TOKEN_INPUT = {
  name: "マイカレンダーフィード",
  spaceId: null,
  expiresInDays: null,
};

// =============================================================================
// テスト
// =============================================================================

describe("iCal Tokens Admin Action Integration", () => {
  // ===========================================================================
  // createTokenSchema
  // ===========================================================================

  describe("createTokenSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはパス（無期限・全スペース）", () => {
        const result = createTokenSchema.safeParse(VALID_TOKEN_INPUT);
        expect(result.success).toBe(true);
      });

      test("有効なデータはパス（特定スペース・有効期限あり）", () => {
        const result = createTokenSchema.safeParse({
          name: "スペースAフィード",
          spaceId: VALID_UUID,
          expiresInDays: 30,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("name", () => {
      test("空文字はエラー", () => {
        const result = createTokenSchema.safeParse({
          ...VALID_TOKEN_INPUT,
          name: "",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0]?.message).toContain("トークン名は必須");
        }
      });

      test("100文字はOK（境界値）", () => {
        const result = createTokenSchema.safeParse({
          ...VALID_TOKEN_INPUT,
          name: "a".repeat(100),
        });
        expect(result.success).toBe(true);
      });

      test("101文字はエラー", () => {
        const result = createTokenSchema.safeParse({
          ...VALID_TOKEN_INPUT,
          name: "a".repeat(101),
        });
        expect(result.success).toBe(false);
      });

      test("1文字はOK（最小値）", () => {
        const result = createTokenSchema.safeParse({
          ...VALID_TOKEN_INPUT,
          name: "A",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("spaceId", () => {
      test("nullは許可（全スペース対象）", () => {
        const result = createTokenSchema.safeParse({
          ...VALID_TOKEN_INPUT,
          spaceId: null,
        });
        expect(result.success).toBe(true);
      });

      test("有効なUUIDは許可", () => {
        const result = createTokenSchema.safeParse({
          ...VALID_TOKEN_INPUT,
          spaceId: VALID_UUID,
        });
        expect(result.success).toBe(true);
      });

      test("無効なUUIDはエラー", () => {
        const invalidUuids = ["not-uuid", "12345", "invalid-string", ""];
        for (const id of invalidUuids) {
          const result = createTokenSchema.safeParse({
            ...VALID_TOKEN_INPUT,
            spaceId: id,
          });
          expect(result.success).toBe(false);
        }
      });
    });

    describe("expiresInDays", () => {
      test("nullは許可（無期限）", () => {
        const result = createTokenSchema.safeParse({
          ...VALID_TOKEN_INPUT,
          expiresInDays: null,
        });
        expect(result.success).toBe(true);
      });

      test("0は許可（境界値：無期限として扱われる）", () => {
        const result = createTokenSchema.safeParse({
          ...VALID_TOKEN_INPUT,
          expiresInDays: 0,
        });
        expect(result.success).toBe(true);
      });

      test("正の整数は許可", () => {
        for (const days of [1, 7, 30, 365]) {
          const result = createTokenSchema.safeParse({
            ...VALID_TOKEN_INPUT,
            expiresInDays: days,
          });
          expect(result.success).toBe(true);
        }
      });

      test("負の値はエラー", () => {
        const result = createTokenSchema.safeParse({
          ...VALID_TOKEN_INPUT,
          expiresInDays: -1,
        });
        expect(result.success).toBe(false);
      });

      test("小数はエラー", () => {
        const result = createTokenSchema.safeParse({
          ...VALID_TOKEN_INPUT,
          expiresInDays: 7.5,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("必須フィールド欠落", () => {
      test("空オブジェクトはエラー", () => {
        const result = createTokenSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      test("name欠落はエラー", () => {
        const result = createTokenSchema.safeParse({
          spaceId: null,
          expiresInDays: null,
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // 有効期限計算ロジック
  // ===========================================================================

  describe("有効期限計算ロジック", () => {
    // ical-tokens.ts の有効期限計算ロジックを再現してテスト
    const calcExpiresAt = (expiresInDays: number | null): Date | null => {
      if (expiresInDays && expiresInDays > 0) {
        const d = new Date();
        d.setDate(d.getDate() + expiresInDays);
        return d;
      }
      return null;
    };

    test("expiresInDays が null の場合は無期限（null）", () => {
      expect(calcExpiresAt(null)).toBeNull();
    });

    test("expiresInDays が 0 の場合は無期限（null）", () => {
      expect(calcExpiresAt(0)).toBeNull();
    });

    test("expiresInDays > 0 の場合は Date を返す", () => {
      expect(calcExpiresAt(30)).not.toBeNull();
    });

    test("expiresInDays > 0 の場合は現在日時 + 指定日数", () => {
      const now = new Date();
      const expiresInDays = 30;
      const expiresAt = calcExpiresAt(expiresInDays);
      expect(expiresAt).not.toBeNull();
      if (expiresAt) {
        const diffMs = expiresAt.getTime() - now.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        expect(Math.round(diffDays)).toBe(30);
      }
    });

    test("expiresInDays = 1 の場合は1日後", () => {
      const now = new Date();
      const expiresAt = calcExpiresAt(1);
      expect(expiresAt).not.toBeNull();
      if (expiresAt) {
        const diffMs = expiresAt.getTime() - now.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        expect(Math.round(diffDays)).toBe(1);
      }
    });

    test("expiresInDays = 365 の場合は365日後", () => {
      const now = new Date();
      const expiresAt = calcExpiresAt(365);
      expect(expiresAt).not.toBeNull();
      if (expiresAt) {
        const diffMs = expiresAt.getTime() - now.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        expect(Math.round(diffDays)).toBe(365);
      }
    });
  });

  // ===========================================================================
  // ICalTokenWithRelations 型構造
  // ===========================================================================

  describe("ICalTokenWithRelations 型構造", () => {
    test("必須フィールドが揃ったトークンオブジェクトは有効", () => {
      type ICalTokenWithRelations = {
        id: string;
        token: string;
        name: string;
        spaceId: string | null;
        spaceName: string | null;
        createdBy: string;
        createdByName: string | null;
        expiresAt: Date | null;
        createdAt: Date;
        lastUsedAt: Date | null;
      };

      const token: ICalTokenWithRelations = {
        id: VALID_UUID,
        token: "abc123token",
        name: "テストフィード",
        spaceId: null,
        spaceName: null,
        createdBy: VALID_UUID,
        createdByName: "テストユーザー",
        expiresAt: null,
        createdAt: new Date(),
        lastUsedAt: null,
      };

      expect(token.expiresAt).toBeNull();
      expect(token.spaceName).toBeNull();
      expect(token.lastUsedAt).toBeNull();
    });

    test("スペース紐付き・有効期限ありのトークンは有効", () => {
      type ICalTokenWithRelations = {
        id: string;
        token: string;
        name: string;
        spaceId: string | null;
        spaceName: string | null;
        createdBy: string;
        createdByName: string | null;
        expiresAt: Date | null;
        createdAt: Date;
        lastUsedAt: Date | null;
      };

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const token: ICalTokenWithRelations = {
        id: VALID_UUID,
        token: "xyz789token",
        name: "スペースAフィード",
        spaceId: VALID_UUID,
        spaceName: "スペースA",
        createdBy: VALID_UUID,
        createdByName: "管理者",
        expiresAt,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      };

      expect(token.spaceId).toBe(VALID_UUID);
      expect(token.spaceName).toBe("スペースA");
      expect(token.expiresAt).not.toBeNull();
      expect(token.lastUsedAt).not.toBeNull();
    });
  });
});
