import { describe, expect, test } from "bun:test";
import {
  isMutationError,
  createMutationError,
} from "@/shared/lib/mutation-result";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { ZodError } from "zod";

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
    const zodError = {
      issues: [
        { path: ["title"], message: "タイトルは必須です" },
        { path: ["slug"], message: "スラッグは必須です" },
      ],
    };
    const result = createValidationMutationError(zodError as ZodError);
    expect(result).toEqual({
      error: "入力内容に誤りがあります",
      fieldErrors: {
        title: ["タイトルは必須です"],
        slug: ["スラッグは必須です"],
      },
    });
    expect("success" in result).toBe(false);
  });
});
