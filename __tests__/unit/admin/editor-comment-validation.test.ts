/**
 * エディタコメントの入力スキーマ。
 *
 * `quotedText` は本文から取った逐語の引用で、`markId` が指す範囲と
 * `CommentCard` が出す引用が食い違わないよう**前後の空白も保持する**。
 * その一方で空白だけの選択は拒否する必要があり、両立させるために
 * 値を書き換える `.trim()` ではなく判定だけの `.refine()` を使っている。
 *
 * ガードを `CommentPlugin`（クライアント）だけに置かないのは、**Server Action の
 * 境界をクライアントに委ねられない**ため。古いクライアントや差し替えた
 * リクエストは `CommentPlugin` を通らずにこの schema へ来る。
 */

import { describe, expect, test } from "bun:test";
import { createEditorCommentThreadSchema } from "@/admin/lib/validations/editor-comment";

const VALID = {
  markId: "mark-1",
  contentType: "post",
  contentId: "11111111-1111-4111-8111-111111111111",
  quotedText: "引用された本文",
  initialComment: "ここが気になります",
};

describe("createEditorCommentThreadSchema.quotedText", () => {
  test("正常系が通る（これが false なら probe 自体が誤り）", () => {
    expect(createEditorCommentThreadSchema.safeParse(VALID).success).toBe(true);
  });

  for (const [label, value] of [
    ["半角空白", "   "],
    ["全角空白", "　　"],
    ["改行", "\n\n"],
    ["タブ", "\t"],
  ] as const) {
    test(`${label}だけの引用を拒否する`, () => {
      const result = createEditorCommentThreadSchema.safeParse({
        ...VALID,
        quotedText: value,
      });
      expect(result.success).toBe(false);
    });
  }

  test("前後の空白は保持する（trim しない）", () => {
    const quotedText = "  インデントされた行\n";
    const result = createEditorCommentThreadSchema.safeParse({
      ...VALID,
      quotedText,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.quotedText).toBe(quotedText);
  });
});
