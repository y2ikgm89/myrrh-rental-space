/**
 * InquiryDefaults — お問い合わせフォームの初期値型 (client-safe SSoT)
 *
 * 公開 ContactForm セクション + PublicInquiryFormCard で消費される。
 * 認証済顧客のプロフィール (Customer) から派生する値と、セクション設定に
 * 紐づく値 (subject 等) を 1 つの shape に統合する。
 *
 * 未ログイン or Customer 未紐づけ時は `{}` を渡す。各フィールドは optional。
 */

import type { CustomerType } from "@/shared/lib/validations/enums/prisma-types";

export type InquiryDefaults = {
  readonly customerType?: CustomerType;
  readonly companyName?: string;
  readonly lastName?: string;
  readonly firstName?: string;
  readonly email?: string;
  /**
   * 会員時 prefill 用: Customer.phoneNumber を流す。
   * Inquiry Overhaul Phase 1 で Inquiry.phoneNumber カラムが追加され、
   * `createInquiryCommand` が受け入れる形になったのに合わせて追加。
   * public フォーム側はまだ prefill 対応前のため optional（後続 PR で配線）。
   */
  readonly phoneNumber?: string;
  readonly subject?: string;
};
