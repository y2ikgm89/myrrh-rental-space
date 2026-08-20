import { z } from "zod";
import {
  EMAIL_MAX_LENGTH,
  optionalPhoneNumberSchema,
} from "./customer-shared-fields";
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
    // **上限は helper と揃える。** ここだけ .max() が無く、マイページからの自己編集で
    // 無制限長の氏名が TEXT 列に入っていた（他の全経路 — 管理画面 / 公開予約 /
    // 問い合わせ — は personNameFieldSchema の 50 文字が効く）。
    lastName: z
      .string({ error: "姓を入力してください" })
      .trim()
      .min(1, { error: "姓を入力してください" })
      .max(50, { error: "姓は50文字以内で入力してください" }),
    firstName: z
      .string({ error: "名を入力してください" })
      .trim()
      .min(1, { error: "名を入力してください" })
      .max(50, { error: "名は50文字以内で入力してください" }),
    companyName: companyNameSchema,
    phoneNumber: optionalPhoneNumberSchema,
    // 初回 email 登録用 (LINE OAuth で email scope 未付与顧客の詰み状態解消)。
    // 既に email が設定済みの顧客は Server Action 側で入力を拒否する
    // (email 変更は verification 経由の Better Auth changeEmail が canonical で、
    // これは PR#15 の scope 外)。
    //
    // **上限は列長と揃える。** ここだけ `.max()` が無く、255 文字以上のアドレスは
    // Zod を通って `pending_customer_email_changes.new_email`（VarChar(254)）への
    // INSERT で 22001 になっていた。呼出側の catch は DomainError 以外を握り潰して
    // 「確認メールの送信に失敗しました」しか出さないので、顧客は理由を知れないまま
    // 何度やっても同じ結果になる — email が無いとマイページから予約履歴・領収書に
    // 辿り着けないので、**詰み状態を解消する唯一の入口が永久に塞がる**。
    email: z
      .union([
        z.literal(""),
        z
          .email({ error: "有効なメールアドレスを入力してください" })
          .max(EMAIL_MAX_LENGTH, {
            error: `メールアドレスは${EMAIL_MAX_LENGTH}文字以内で入力してください`,
          }),
      ])
      .optional(),
    /**
     * お知らせ・キャンペーンメール受信可否（`Customer.marketingOptIn`）。
     * checkbox は未チェック時に FormData へ出ないため、`"on"` / 欠落を boolean に正規化する。
     */
    marketingOptIn: z.preprocess(
      (value) => value === true || value === "on" || value === "true",
      z.boolean(),
    ),
    turnstileToken: z.string().optional(),
  })
  .refine(requireCompanyNameForCorporate, COMPANY_NAME_REFINE_ERROR);

export type CustomerProfileInput = z.input<typeof customerProfileSchema>;
