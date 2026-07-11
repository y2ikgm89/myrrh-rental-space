import { z } from "zod";
import { optionalPhoneNumberSchema } from "./customer-shared-fields";
import {
  customerTypeSchema,
  companyNameSchema,
  requireCompanyNameForCorporate,
  COMPANY_NAME_REFINE_ERROR,
} from "./customer-type";

export const customerProfileSchema = z
  .object({
    customerType: customerTypeSchema,
    // lastName / firstName は独自 label ("姓を入力してください" / "名を入力してください")
    // を維持するため personNameFieldSchema helper (label 引数式) を使わず個別維持。
    lastName: z.string().min(1, { error: "姓を入力してください" }),
    firstName: z.string().min(1, { error: "名を入力してください" }),
    companyName: companyNameSchema,
    phoneNumber: optionalPhoneNumberSchema,
    turnstileToken: z.string().optional(),
  })
  .refine(requireCompanyNameForCorporate, COMPANY_NAME_REFINE_ERROR);

export type CustomerProfileInput = z.input<typeof customerProfileSchema>;
