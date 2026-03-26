import { z } from "zod";

export const customerProfileSchema = z.object({
  lastName: z.string().min(1, { error: "姓を入力してください" }),
  firstName: z.string().min(1, { error: "名を入力してください" }),
  phoneNumber: z
    .string()
    .max(20, { error: "電話番号は20文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
});

export type CustomerProfileInput = z.input<typeof customerProfileSchema>;
