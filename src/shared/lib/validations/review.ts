import { z } from "zod";

export const spaceReviewSchema = z.object({
  reservationId: z.string().uuid({ error: "予約IDが不正です" }),
  rating: z
    .number()
    .int()
    .min(1, { error: "1以上を選択してください" })
    .max(5, { error: "5以下を選択してください" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内" })
    .optional()
    .or(z.literal("")),
  comment: z
    .string()
    .max(1000, { error: "コメントは1000文字以内" })
    .optional()
    .or(z.literal("")),
  turnstileToken: z.string().min(1, { error: "認証トークンが必要です" }),
});

export type SpaceReviewInput = z.infer<typeof spaceReviewSchema>;
