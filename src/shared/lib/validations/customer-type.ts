import { z } from "zod";

export const CUSTOMER_TYPES = ["personal", "corporate"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const customerTypeSchema = z.enum(CUSTOMER_TYPES).default("personal");

export const companyNameSchema = z
  .string()
  .max(100, { error: "会社名は100文字以内で入力してください" })
  .optional()
  .or(z.literal(""));

/**
 * 法人選択時に companyName が必須であることを検証する refine
 */
export function requireCompanyNameForCorporate(data: {
  customerType: CustomerType;
  companyName?: string | undefined;
}) {
  return data.customerType !== "corporate" || !!data.companyName?.trim();
}

export const COMPANY_NAME_REFINE_ERROR = {
  error: "法人の場合、会社名は必須です",
  path: ["companyName"],
};
