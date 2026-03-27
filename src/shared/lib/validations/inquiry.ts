import { z } from "zod";
import {
  customerTypeSchema,
  companyNameSchema,
  requireCompanyNameForCorporate,
  COMPANY_NAME_REFINE_ERROR,
} from "./customer-type";

export { CUSTOMER_TYPES, type CustomerType } from "./customer-type";

export const publicInquirySchema = z
  .object({
    customerType: customerTypeSchema,
    companyName: companyNameSchema,
    lastName: z
      .string()
      .min(1, { error: "姓は必須です" })
      .max(50, { error: "姓は50文字以内で入力してください" }),
    firstName: z
      .string()
      .min(1, { error: "名は必須です" })
      .max(50, { error: "名は50文字以内で入力してください" }),
    email: z
      .string()
      .email({ error: "有効なメールアドレスを入力してください" }),
    subject: z
      .string()
      .min(1, { error: "件名は必須です" })
      .max(200, { error: "件名は200文字以内で入力してください" }),
    message: z
      .string()
      .min(1, { error: "お問い合わせ内容は必須です" })
      .max(5000, {
        error: "お問い合わせ内容は5000文字以内で入力してください",
      }),
    turnstileToken: z.string().optional(),
  })
  .refine(requireCompanyNameForCorporate, COMPANY_NAME_REFINE_ERROR);

export type PublicInquiryInput = z.input<typeof publicInquirySchema>;
