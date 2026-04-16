import { z } from "zod";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";

export { CustomerType } from "@/shared/lib/validations/enums/prisma-types";

export const customerTypeSchema = z
  .enum(CustomerType)
  .default(CustomerType.PERSONAL);

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
  return (
    data.customerType !== CustomerType.CORPORATE || !!data.companyName?.trim()
  );
}

export const COMPANY_NAME_REFINE_ERROR = {
  error: "法人の場合、会社名は必須です",
  path: ["companyName"],
};
