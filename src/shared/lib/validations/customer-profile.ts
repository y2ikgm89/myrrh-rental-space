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
    // 初回 email 登録用 (LINE OAuth で email scope 未付与顧客の詰み状態解消)。
    // 既に email が設定済みの顧客は Server Action 側で入力を拒否する
    // (email 変更は verification 経由の Better Auth changeEmail が canonical で、
    // これは PR#15 の scope 外)。
    email: z
      .union([
        z.literal(""),
        z.email({ error: "有効なメールアドレスを入力してください" }),
      ])
      .optional(),
    turnstileToken: z.string().optional(),
  })
  .refine(requireCompanyNameForCorporate, COMPANY_NAME_REFINE_ERROR);

export type CustomerProfileInput = z.input<typeof customerProfileSchema>;
