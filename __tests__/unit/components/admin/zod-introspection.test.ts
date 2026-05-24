/**
 * zod-introspection — ZodPrefault unwrap 回帰テスト
 *
 * PR #221 で `getZodObjectShape` / `extractFieldMetaDeep` の prefault unwrap を修正したが、
 * 同ファイル内の他 4 helper (`getSelectOptions` / `getArrayItemShape` /
 * `getArrayConstraints` / `extractDiscriminatedUnionInfo`) でも同パターンの
 * unwrap が必要。本テストは 4 helper すべてが `default` / `optional` / `prefault`
 * を再帰アンラップすることを契約として固定する。
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  extractDiscriminatedUnionInfo,
  getArrayConstraints,
  getArrayItemShape,
  getSelectOptions,
} from "@/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/zod-introspection";

describe("zod-introspection — ZodPrefault unwrap", () => {
  describe("getSelectOptions", () => {
    const enumSchema = z.enum(["a", "b", "c"]);

    test("素の z.enum は entries を返す", () => {
      expect(getSelectOptions(enumSchema)).toEqual(["a", "b", "c"]);
    });

    test("z.enum(...).default(...) は unwrap して entries を返す", () => {
      expect(getSelectOptions(enumSchema.default("a"))).toEqual([
        "a",
        "b",
        "c",
      ]);
    });

    test("z.enum(...).optional() は unwrap して entries を返す", () => {
      expect(getSelectOptions(enumSchema.optional())).toEqual(["a", "b", "c"]);
    });

    test("z.enum(...).prefault(...) は unwrap して entries を返す", () => {
      expect(getSelectOptions(enumSchema.prefault("a"))).toEqual([
        "a",
        "b",
        "c",
      ]);
    });
  });

  describe("getArrayItemShape", () => {
    const itemSchema = z.object({ name: z.string(), value: z.number() });
    const arraySchema = z.array(itemSchema);

    test("素の z.array(z.object(...)) は element.shape を返す", () => {
      const shape = getArrayItemShape(arraySchema);
      expect(shape).toBeDefined();
      expect(Object.keys(shape ?? {})).toEqual(["name", "value"]);
    });

    test("z.array(...).default([]) は unwrap して shape を返す", () => {
      const shape = getArrayItemShape(arraySchema.default([]));
      expect(Object.keys(shape ?? {})).toEqual(["name", "value"]);
    });

    test("z.array(...).optional() は unwrap して shape を返す", () => {
      const shape = getArrayItemShape(arraySchema.optional());
      expect(Object.keys(shape ?? {})).toEqual(["name", "value"]);
    });

    test("z.array(...).prefault([]) は unwrap して shape を返す", () => {
      const shape = getArrayItemShape(arraySchema.prefault([]));
      expect(Object.keys(shape ?? {})).toEqual(["name", "value"]);
    });
  });

  describe("getArrayConstraints", () => {
    const baseSchema = z.array(z.string()).min(2).max(5);

    test("素の z.array(...).min(N).max(M) は { min, max } を返す", () => {
      expect(getArrayConstraints(baseSchema)).toEqual({ min: 2, max: 5 });
    });

    test("z.array(...).min().max().default([]) は unwrap して制約を返す", () => {
      expect(getArrayConstraints(baseSchema.default([]))).toEqual({
        min: 2,
        max: 5,
      });
    });

    test("z.array(...).min().max().optional() は unwrap して制約を返す", () => {
      expect(getArrayConstraints(baseSchema.optional())).toEqual({
        min: 2,
        max: 5,
      });
    });

    test("z.array(...).min().max().prefault([]) は unwrap して制約を返す", () => {
      expect(getArrayConstraints(baseSchema.prefault([]))).toEqual({
        min: 2,
        max: 5,
      });
    });
  });

  describe("extractDiscriminatedUnionInfo", () => {
    const duSchema = z.discriminatedUnion("variant", [
      z.object({ variant: z.literal("image"), url: z.string() }),
      z.object({ variant: z.literal("video"), src: z.string() }),
    ]);

    test("素の discriminatedUnion は discriminator + options を返す", () => {
      const info = extractDiscriminatedUnionInfo(duSchema);
      expect(info).toBeDefined();
      expect(info?.discriminator).toBe("variant");
      expect(info?.options.map((o) => o.value)).toEqual(["image", "video"]);
    });

    test("z.discriminatedUnion(...).default(...) は unwrap して info を返す", () => {
      const info = extractDiscriminatedUnionInfo(
        duSchema.default({ variant: "image", url: "" }),
      );
      expect(info?.discriminator).toBe("variant");
      expect(info?.options.map((o) => o.value)).toEqual(["image", "video"]);
    });

    test("z.discriminatedUnion(...).optional() は unwrap して info を返す", () => {
      const info = extractDiscriminatedUnionInfo(duSchema.optional());
      expect(info?.discriminator).toBe("variant");
      expect(info?.options.map((o) => o.value)).toEqual(["image", "video"]);
    });

    test("z.discriminatedUnion(...).prefault(...) は unwrap して info を返す", () => {
      const info = extractDiscriminatedUnionInfo(
        duSchema.prefault({ variant: "image", url: "" }),
      );
      expect(info?.discriminator).toBe("variant");
      expect(info?.options.map((o) => o.value)).toEqual(["image", "video"]);
    });
  });
});
