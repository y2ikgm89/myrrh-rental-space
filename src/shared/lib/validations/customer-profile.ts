import { z } from "zod";
import {
  customerTypeSchema,
  companyNameSchema,
  requireCompanyNameForCorporate,
  COMPANY_NAME_REFINE_ERROR,
} from "./customer-type";

export const customerProfileSchema = z
  .object({
    customerType: customerTypeSchema,
    lastName: z.string().min(1, { error: "姓を入力してください" }),
    firstName: z.string().min(1, { error: "名を入力してください" }),
    companyName: companyNameSchema,
    phoneNumber: z
      .string()
      .max(20, { error: "電話番号は20文字以内で入力してください" })
      .optional()
      .or(z.literal("")),
    turnstileToken: z.string().optional(),
  })
  .refine(requireCompanyNameForCorporate, COMPANY_NAME_REFINE_ERROR);

export type CustomerProfileInput = z.input<typeof customerProfileSchema>;
