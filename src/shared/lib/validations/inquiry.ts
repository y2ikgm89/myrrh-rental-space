import { z } from "zod";
import {
  customerTypeSchema,
  companyNameSchema,
  requireCompanyNameForCorporate,
  COMPANY_NAME_REFINE_ERROR,
} from "./customer-type";
import {
  emailFieldSchema,
  personNameFieldSchema,
} from "./customer-shared-fields";

export { CustomerType } from "./customer-type";

export const publicInquirySchema = z
  .object({
    customerType: customerTypeSchema,
    companyName: companyNameSchema,
    lastName: personNameFieldSchema("姓"),
    firstName: personNameFieldSchema("名"),
    email: emailFieldSchema,
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
    agreedTermsIds: z
      .array(z.uuid({ error: "規約IDが不正です" }))
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, {
        error: "同じ規約に複数回同意することはできません",
      }),
    turnstileToken: z.string().optional(),
  })
  .refine(requireCompanyNameForCorporate, COMPANY_NAME_REFINE_ERROR);

export type PublicInquiryInput = z.input<typeof publicInquirySchema>;
