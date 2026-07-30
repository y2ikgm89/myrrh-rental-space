import { z } from "zod";

/**
 * 管理者オーサリング型 event broadcast (T12) — 件名 / 本文の Zod schema。
 *
 * subject / body の境界値:
 *  - subject: 1〜200 文字 (メール件名として実用的な上限)
 *  - body: 1〜5000 文字 (plain text 本文、改行込み想定)
 *
 * 空文字は Zod parse で reject する (空件名 / 空本文の送信は運用上の事故を招く)。
 *
 * **`"use server"` ファイルに置かないこと。** Next.js は `"use server"` ファイルの
 * export を async 関数だけに制限しており、object を export するとモジュール評価が
 * 実行時に throw して同ファイルの Server Action が全滅する
 * (`A "use server" file can only export async functions, found object.`)。
 * この schema は client component (`BroadcastForm.tsx`) からも import されるため、
 * server / client 双方から安全に読める本モジュールが正しい置き場所。
 * gate: `__tests__/unit/architecture/use-server-exports.test.ts`
 */
export const eventBroadcastSchema = z.object({
  subject: z
    .string({ error: "件名を入力してください" })
    .trim()
    .min(1, "件名を入力してください")
    .max(200, "件名は 200 文字以内で入力してください"),
  body: z
    .string({ error: "本文を入力してください" })
    .trim()
    .min(1, "本文を入力してください")
    .max(5000, "本文は 5000 文字以内で入力してください"),
});

export type EventBroadcastFormData = z.infer<typeof eventBroadcastSchema>;
