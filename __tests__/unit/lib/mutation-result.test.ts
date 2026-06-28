import { describe, expect, test } from "bun:test";
import {
  isMutationError,
  createMutationError,
} from "@/shared/lib/mutation-result";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { z } from "zod";

describe("mutation-result", () => {
  test("createMutationError は error と fieldErrors を持つオブジェクトを返す", () => {
    const result = createMutationError("入力エラー", {
      title: ["必須です"],
    });

    expect(result).toEqual({
      error: "入力エラー",
      fieldErrors: { title: ["必須です"] },
    });
  });

  test("createMutationError は fieldErrors なしでも動作する", () => {
    const result = createMutationError("エラーが発生しました");
    expect(result).toEqual({ error: "エラーが発生しました" });
  });

  test("isMutationError は error payload を判定する", () => {
    expect(isMutationError({ error: "失敗しました" })).toBe(true);
    expect(isMutationError({ id: "bar-1" })).toBe(false);
    expect(isMutationError(null)).toBe(false);
  });
});

describe("createValidationMutationError", () => {
  test("ZodError を MutationError に変換する", () => {
    const schema = z.object({
      title: z.string({ error: "タイトルは必須です" }),
      slug: z.string({ error: "スラッグは必須です" }),
    });
    const parsed = schema.safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("schema must reject empty input");
    }
    const result = createValidationMutationError(parsed.error);
    expect(result).toEqual({
      error: "入力内容に誤りがあります",
      code: "VALIDATION",
      fieldErrors: {
        title: ["タイトルは必須です"],
        slug: ["スラッグは必須です"],
      },
    });
    expect("success" in result).toBe(false);
  });
});
