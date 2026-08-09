import { z } from "zod";

/**
 * ゲスト向け領収書再送信リクエストの入力スキーマ。
 *
 * Server Action (`requestReceiptResendAction`) と、それを submit する client
 * component (`ReceiptResendForm`) の **両方**が参照する。action 本体は
 * `"use server"` ファイルにあり async 関数しか export できないため、schema は
 * ここに置く。
 *
 * bot 対策の 2 フィールドは公開フォーム共通の形に合わせてある:
 *
 * - `website` — honeypot。フォームに実在しない項目名を装い、bot が機械的に
 *   埋めやすい名前にする（OWASP Automated Threats Handbook 推奨）
 * - `formRenderedAt` — 表示から 3 秒未満の送信を弾く時間トラップ。FormData から
 *   来る値は文字列なので `z.coerce.number()` で受ける
 *
 * どちらも **Zod ではエラーにしない**。validation エラーとして出すと bot に
 * 何が引っかかったかを教えてしまうので、判定は Server Action 側の
 * `checkBotHeuristics` が行い、結果は一律の応答に畳む。
 */
export const receiptResendRequestSchema = z.object({
  serialNo: z
    .string()
    .trim()
    .min(1, { error: "領収書番号を入力してください" })
    .max(20, { error: "領収書番号は20文字以内で入力してください" }),
  email: z
    .email({ error: "メールアドレスの形式が正しくありません" })
    .max(255, { error: "メールアドレスは255文字以内で入力してください" }),
  website: z.string().optional(),
  formRenderedAt: z.coerce.number().int().nonnegative().optional(),
  turnstileToken: z.string().optional(),
});

export type ReceiptResendRequestInput = z.input<
  typeof receiptResendRequestSchema
>;
