/**
 * field-registry ユニットテスト（旧 field-helpers.test.ts）
 *
 * src/shared/lib/sections/field-registry.ts の各ヘルパーと fieldRegistry を検証する。
 * 純粋モジュール（Prisma / server-only 依存なし）のため mock.module 不要。
 * ADR 0018: .describe(JSON.stringify()) → z.registry<FieldMeta>() へ移行済み
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { field, fieldRegistry } from "@/shared/lib/sections/field-registry";

// 後方互換: extractFieldMeta の代替として fieldRegistry.get を使う
const extractFieldMeta = (schema: z.ZodType) => fieldRegistry.get(schema);

// ─────────────────────────────────────────────────────────────
// fieldRegistry.get (extractFieldMeta ラッパー)
// ─────────────────────────────────────────────────────────────

describe("extractFieldMeta (fieldRegistry.get wrapper)", () => {
  test("registry に未登録のスキーマは undefined を返す", () => {
    const schema = z.string();
    expect(extractFieldMeta(schema)).toBeUndefined();
  });

  test("field.text で登録したスキーマは FieldMeta を返す", () => {
    const schema = field.text("タイトル");
    const meta = extractFieldMeta(schema);
    expect(meta).toBeDefined();
    expect(meta?.fieldType).toBe("text");
    expect(meta?.label).toBe("タイトル");
  });
});

// ─────────────────────────────────────────────────────────────
// field.text
// ─────────────────────────────────────────────────────────────

describe("field.text", () => {
  test("デフォルト値が空文字列の string スキーマを返す", () => {
    const schema = field.text("タイトル");

    // デフォルト値の検証
    const result = schema.parse(undefined);
    expect(result).toBe("");
  });

  test("指定したデフォルト値を使う", () => {
    const schema = field.text("タイトル", { default: "初期値" });
    expect(schema.parse(undefined)).toBe("初期値");
  });

  test("FieldMeta が抽出できる（fieldType: text）", () => {
    const schema = field.text("タイトル", { placeholder: "入力してください" });
    const meta = extractFieldMeta(schema);
    expect(meta).toBeDefined();
    expect(meta?.fieldType).toBe("text");
    expect(meta?.label).toBe("タイトル");
    expect(meta?.placeholder).toBe("入力してください");
  });
});

// ─────────────────────────────────────────────────────────────
// field.number
// ─────────────────────────────────────────────────────────────

describe("field.number", () => {
  test("デフォルト値 0 の number スキーマを返す", () => {
    const schema = field.number("数量");
    expect(schema.parse(undefined)).toBe(0);
  });

  test("min 未満の値はバリデーションエラーになる", () => {
    const schema = field.number("数量", { min: 1, max: 100 });
    const result = schema.safeParse(0);
    expect(result.success).toBe(false);
  });

  test("max 超過の値はバリデーションエラーになる", () => {
    const schema = field.number("数量", { min: 1, max: 100 });
    const result = schema.safeParse(101);
    expect(result.success).toBe(false);
  });

  test("範囲内の値は通過する", () => {
    const schema = field.number("数量", { min: 1, max: 100, default: 50 });
    expect(schema.parse(50)).toBe(50);
  });

  test("FieldMeta が抽出できる（fieldType: number）", () => {
    const schema = field.number("数量", { suffix: "個" });
    const meta = extractFieldMeta(schema);
    expect(meta?.fieldType).toBe("number");
    expect(meta?.label).toBe("数量");
    expect(meta?.suffix).toBe("個");
  });
});

// ─────────────────────────────────────────────────────────────
// field.boolean
// ─────────────────────────────────────────────────────────────

describe("field.boolean", () => {
  test("デフォルト値は false", () => {
    const schema = field.boolean("表示する");
    expect(schema.parse(undefined)).toBe(false);
  });

  test("true を指定した場合は true になる", () => {
    const schema = field.boolean("表示する", { default: true });
    expect(schema.parse(undefined)).toBe(true);
  });

  test("FieldMeta が抽出できる（fieldType: boolean）", () => {
    const schema = field.boolean("表示する");
    const meta = extractFieldMeta(schema);
    expect(meta?.fieldType).toBe("boolean");
    expect(meta?.label).toBe("表示する");
  });
});

// ─────────────────────────────────────────────────────────────
// field.select
// ─────────────────────────────────────────────────────────────

describe("field.select", () => {
  const options = ["small", "medium", "large"] as const;

  test("デフォルト値を正しく返す", () => {
    const schema = field.select("サイズ", { options, default: "medium" });
    expect(schema.parse(undefined)).toBe("medium");
  });

  test("options 外の値はバリデーションエラーになる", () => {
    const schema = field.select("サイズ", { options, default: "medium" });
    const result = schema.safeParse("xlarge");
    expect(result.success).toBe(false);
  });

  test("options 内の値は通過する", () => {
    const schema = field.select("サイズ", { options, default: "medium" });
    expect(schema.parse("large")).toBe("large");
  });

  test("FieldMeta が抽出できる（fieldType: select）", () => {
    const schema = field.select("サイズ", { options, default: "small" });
    const meta = extractFieldMeta(schema);
    expect(meta?.fieldType).toBe("select");
    expect(meta?.label).toBe("サイズ");
  });
});

// ─────────────────────────────────────────────────────────────
// field.image
// ─────────────────────────────────────────────────────────────

describe("field.image", () => {
  test("デフォルト値が空文字列の string スキーマを返す", () => {
    const schema = field.image("メイン画像");
    expect(schema.parse(undefined)).toBe("");
  });

  test("FieldMeta の fieldType が image", () => {
    const schema = field.image("メイン画像");
    const meta = extractFieldMeta(schema);
    expect(meta?.fieldType).toBe("image");
    expect(meta?.label).toBe("メイン画像");
  });
});

// ─────────────────────────────────────────────────────────────
// field.url
// ─────────────────────────────────────────────────────────────

describe("field.url", () => {
  test("デフォルト値は空文字列", () => {
    const schema = field.url("リンク");
    expect(schema.parse(undefined)).toBe("");
  });

  test("有効な URL は通過する", () => {
    const schema = field.url("リンク");
    expect(schema.parse("https://example.com")).toBe("https://example.com");
  });

  test("空文字列は通過する", () => {
    const schema = field.url("リンク");
    expect(schema.parse("")).toBe("");
  });

  test("無効な URL（空でもない）はバリデーションエラーになる", () => {
    const schema = field.url("リンク");
    const result = schema.safeParse("not-a-url");
    expect(result.success).toBe(false);
  });

  test("FieldMeta の fieldType が url", () => {
    const schema = field.url("リンク");
    const meta = extractFieldMeta(schema);
    expect(meta?.fieldType).toBe("url");
  });
});

// ─────────────────────────────────────────────────────────────
// field.array
// ─────────────────────────────────────────────────────────────

describe("field.array", () => {
  const itemFields = {
    title: field.text("タイトル"),
    url: field.url("URL"),
  };

  test("デフォルト値は空配列", () => {
    const schema = field.array("リンク一覧", { fields: itemFields });
    expect(schema.parse(undefined)).toEqual([]);
  });

  test("アイテムが正しくバリデーションされる", () => {
    const schema = field.array("リンク一覧", { fields: itemFields });
    const result = schema.parse([
      { title: "テスト", url: "https://example.com" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("テスト");
  });

  test("FieldMeta の fieldType が array", () => {
    const schema = field.array("リンク一覧", { fields: itemFields });
    const meta = extractFieldMeta(schema);
    expect(meta?.fieldType).toBe("array");
    expect(meta?.label).toBe("リンク一覧");
  });
});
