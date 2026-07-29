import { z } from "zod";
import { TRANSFER_ACCOUNT_TYPE } from "@/shared/lib/validations/enums/helpers";

export const TRANSFER_ACCOUNT_TYPE_VALUES = Object.values(
  TRANSFER_ACCOUNT_TYPE,
) as [string, ...string[]];

const transferAccountTypeSchema = z.enum(TRANSFER_ACCOUNT_TYPE_VALUES, {
  error: "口座種別が不正です",
});

export const transferAccountFormSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, { error: "表示名を入力してください" })
    .max(50, { error: "表示名は50文字以内です" }),
  bankName: z
    .string()
    .trim()
    .min(1, { error: "金融機関名を入力してください" })
    .max(50, { error: "金融機関名は50文字以内です" }),
  branchName: z
    .string()
    .trim()
    .min(1, { error: "支店名を入力してください" })
    .max(50, { error: "支店名は50文字以内です" }),
  accountType: transferAccountTypeSchema,
  accountNumber: z
    .string()
    .trim()
    .min(1, { error: "口座番号を入力してください" })
    .max(20, { error: "口座番号は20文字以内です" }),
  accountHolderName: z
    .string()
    .trim()
    .min(1, { error: "口座名義を入力してください" })
    .max(100, { error: "口座名義は100文字以内です" }),
  note: z
    .string()
    .trim()
    .max(200, { error: "補足は200文字以内です" })
    .optional()
    .transform((value) => value || undefined),
  sortOrder: z.coerce
    .number()
    .int({ error: "表示順は整数で入力してください" })
    .min(0, { error: "表示順は0以上です" })
    .default(0),
  isActive: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .transform((value) => value === true || value === "true"),
});

export const transferGuidanceFormSchema = z.object({
  transferGuidance: z
    .string()
    .trim()
    .max(5000, { error: "案内文は5000文字以内です" })
    .optional()
    .transform((value) => value || null),
  expectedUpdatedAt: z.string().min(1, { error: "更新日時が不正です" }),
});
