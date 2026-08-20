import { z } from "zod";

export const reissueReceiptInputSchema = z.object({
  originalReceiptId: z.uuid({ error: "領収書IDが不正です" }),
  reason: z
    .string({ error: "再発行理由を入力してください" })
    .trim()
    .min(1, { error: "再発行理由を入力してください" })
    .max(500, { error: "再発行理由は500文字以内で入力してください" }),
});
