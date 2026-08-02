import { z } from "zod";
import { isCommentableContentType } from "./types";

/**
 * エディタのコメントスレッド作成・返信の入力スキーマ。
 *
 * Server Action（`createCommentThread` / `addComment`）が参照する。action 本体は
 * `"use server"` ファイルにあり async 関数しか export できないため、schema は
 * ここに置く（配置規約は `.claude/rules/forms-mutations.md`）。
 *
 * `validations/` ではなく domain 側に置くのは、`contentType` の判定に
 * `isCommentableContentType`（domain の型ガード）が要るため。`shared/lib` から
 * `shared/domain` への import は ratchet で凍結されている。
 */
export const createEditorCommentThreadSchema = z.object({
  // eslint-disable-next-line local/require-trimmed-text -- Lexical の MarkNode が生成する内部 ID
  markId: z.string().min(1, { error: "markId は必須です" }),
  contentType: z
    .string()
    .refine(isCommentableContentType, { error: "contentType が無効です" }),
  contentId: z.uuid({ error: "contentId は有効な UUID である必要があります" }),
  /**
   * 選択範囲を**逐語で**保持する。`markId` が指す本文と `CommentCard` が出す引用が
   * 食い違わないよう、インデントや行頭・行末の空白も落とさない。
   *
   * ただし空白だけの選択は**ここで**拒否する。`CommentPlugin` にも同じガードが
   * あるが、**Server Action の境界をクライアントに委ねない** — 古いクライアントや
   * 差し替えたリクエストは `CommentPlugin` を通らずにここへ来る。
   *
   * 値を書き換える `.trim()` ではなく判定だけの `.refine()` を使うことで、
   * 逐語保持と空白のみ拒否を両立させる。
   */
  // eslint-disable-next-line local/require-trimmed-text -- 逐語の引用。空白のみは下の refine が拒否する
  quotedText: z
    .string()
    .min(1, { error: "引用テキストは必須です" })
    .max(2000, { error: "引用テキストは2000文字以内" })
    .refine((value) => value.trim().length > 0, {
      error: "引用テキストは必須です",
    }),
  initialComment: z
    .string()
    .trim()
    .min(1, { error: "コメントは必須です" })
    .max(5000, { error: "コメントは5000文字以内" }),
});

export const addEditorCommentSchema = z.object({
  threadId: z.uuid({ error: "threadId は有効な UUID である必要があります" }),
  content: z
    .string()
    .trim()
    .min(1, { error: "コメントは必須です" })
    .max(5000, { error: "コメントは5000文字以内" }),
});
