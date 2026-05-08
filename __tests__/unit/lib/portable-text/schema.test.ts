import { describe, expect, test } from "bun:test";
import {
  portableTextSpanSchema,
  portableTextBlockSchema,
  createSpanArraySchema,
  createBlockArraySchema,
} from "@/shared/lib/portable-text/schema";

describe("portableTextSpanSchema", () => {
  test("text span: _type=span / _key / text を要求する", () => {
    const ok = portableTextSpanSchema.safeParse({
      _key: "11111111-1111-4111-8111-111111111111",
      _type: "span",
      text: "Hello",
    });
    expect(ok.success).toBe(true);
  });

  test("iconInline span: _type=iconInline / _key / name を要求する", () => {
    const ok = portableTextSpanSchema.safeParse({
      _key: "22222222-2222-4222-8222-222222222222",
      _type: "iconInline",
      name: "IconHeart",
    });
    expect(ok.success).toBe(true);
  });

  test("旧 type:'text' は受け付けない", () => {
    const ng = portableTextSpanSchema.safeParse({
      _key: "33333333-3333-4333-8333-333333333333",
      type: "text",
      value: "old",
    });
    expect(ng.success).toBe(false);
  });

  test("text は max 500 文字", () => {
    const ng = portableTextSpanSchema.safeParse({
      _key: "44444444-4444-4444-8444-444444444444",
      _type: "span",
      text: "a".repeat(501),
    });
    expect(ng.success).toBe(false);
  });

  test("iconInline.name は IconXxx パターン強制", () => {
    const ng = portableTextSpanSchema.safeParse({
      _key: "55555555-5555-4555-8555-555555555555",
      _type: "iconInline",
      name: "lowercase",
    });
    expect(ng.success).toBe(false);
  });

  test("iconInline.name 空文字列は不可", () => {
    const ng = portableTextSpanSchema.safeParse({
      _key: "66666666-6666-4666-8666-666666666666",
      _type: "iconInline",
      name: "",
    });
    expect(ng.success).toBe(false);
  });

  test("_key 空文字列は不可", () => {
    const ng = portableTextSpanSchema.safeParse({
      _key: "",
      _type: "span",
      text: "x",
    });
    expect(ng.success).toBe(false);
  });
});

describe("portableTextBlockSchema", () => {
  test("block は _type=block / _key / style=normal / children を持つ", () => {
    const ok = portableTextBlockSchema.safeParse({
      _key: "77777777-7777-4777-8777-777777777777",
      _type: "block",
      style: "normal",
      children: [],
    });
    expect(ok.success).toBe(true);
  });

  test("style 未指定なら default normal", () => {
    const ok = portableTextBlockSchema.safeParse({
      _key: "88888888-8888-4888-8888-888888888888",
      _type: "block",
      children: [],
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.style).toBe("normal");
  });

  test("children は max 200", () => {
    const tooMany = Array.from({ length: 201 }, (_, i) => ({
      _key: `key-${i.toString().padStart(8, "0")}`,
      _type: "span" as const,
      text: "x",
    }));
    const ng = portableTextBlockSchema.safeParse({
      _key: "99999999-9999-4999-8999-999999999999",
      _type: "block",
      children: tooMany,
    });
    expect(ng.success).toBe(false);
  });
});

describe("createSpanArraySchema", () => {
  test("既定 maxSpans=50、safeParse(undefined) で [] フォールバック", () => {
    const schema = createSpanArraySchema({});
    const result = schema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([]);
  });

  test("maxSpans を超えるとエラー", () => {
    const schema = createSpanArraySchema({ maxSpans: 2 });
    const arr = Array.from({ length: 3 }, (_, i) => ({
      _key: `aaaaaaaa-aaaa-4aaa-8aaa-${i.toString().padStart(12, "0")}`,
      _type: "span" as const,
      text: "x",
    }));
    expect(schema.safeParse(arr).success).toBe(false);
  });

  test("有効な span 配列を受け付ける", () => {
    const schema = createSpanArraySchema({});
    const ok = schema.safeParse([
      {
        _key: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        _type: "span",
        text: "Hello ",
      },
      {
        _key: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        _type: "iconInline",
        name: "IconHeart",
      },
    ]);
    expect(ok.success).toBe(true);
  });
});

describe("createBlockArraySchema", () => {
  test("既定 maxBlocks=50、safeParse(undefined) で [] フォールバック", () => {
    const schema = createBlockArraySchema({});
    const result = schema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([]);
  });

  test("maxBlocks を超えるとエラー", () => {
    const schema = createBlockArraySchema({ maxBlocks: 2 });
    const arr = Array.from({ length: 3 }, (_, i) => ({
      _key: `dddddddd-dddd-4ddd-8ddd-${i.toString().padStart(12, "0")}`,
      _type: "block" as const,
      style: "normal" as const,
      children: [],
    }));
    expect(schema.safeParse(arr).success).toBe(false);
  });
});
