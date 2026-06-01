import { z } from "zod";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";

/**
 * 規約タイプ — 業務上想定される標準値（VARCHAR 自由文字列）。
 *
 * Prisma `TermsType` enum を廃止し VARCHAR 化したため、新規タイプ追加で
 * マイグレーションは不要。下記定数は seed / 管理 UI のテンプレート選択 /
 * バッジ表示でのみ使われる。
 */
export const TERMS_TYPE_VALUES = [
  "terms-of-use",
  "privacy-policy",
  "cancellation",
  "payment",
  "rental-terms",
  "commercial-transaction",
  "review-guidelines",
  "cookie-policy",
  "custom",
] as const;
export type TermsTypeValue = (typeof TERMS_TYPE_VALUES)[number];

export const TERMS_TYPE_LABELS: Record<string, string> = {
  "terms-of-use": "利用規約",
  "privacy-policy": "プライバシーポリシー",
  cancellation: "キャンセルポリシー",
  payment: "支払い規約",
  "rental-terms": "施設利用規約",
  "commercial-transaction": "特定商取引法に基づく表記",
  "review-guidelines": "レビュー投稿ガイドライン",
  "cookie-policy": "Cookie ポリシー",
  custom: "カスタム規約",
};

export const TERMS_AGREEMENT_CONTEXT = {
  RESERVATION: "reservation",
  INQUIRY: "inquiry",
  SIGNUP: "signup",
} as const;
export type TermsAgreementContext =
  (typeof TERMS_AGREEMENT_CONTEXT)[keyof typeof TERMS_AGREEMENT_CONTEXT];

const slugSchema = z
  .string()
  .min(1, { error: "スラッグを入力してください" })
  .max(50, { error: "スラッグは50文字以内です" })
  .regex(/^[a-z0-9-]+$/u, {
    error: "スラッグは小文字英数字とハイフンのみ使用できます",
  });

const typeSchema = z
  .string()
  .min(1, { error: "タイプを入力してください" })
  .max(64, { error: "タイプは64文字以内です" })
  .regex(/^[a-z0-9-]+$/u, {
    error: "タイプは小文字英数字とハイフンのみ使用できます",
  });

const titleSchema = z
  .string()
  .min(1, { error: "タイトルを入力してください" })
  .max(100, { error: "タイトルは100文字以内です" });

/**
 * 規約作成・編集フォームスキーマ
 *
 * `footerOrder` はシステム管理（D&D 並び替えが SSoT、手動入力なし）。
 */
export const termsFormSchema = z.object({
  type: typeSchema,
  slug: slugSchema,
  title: titleSchema,
  contentJson: lexicalJsonSchema,
  /** クライアント側 `renderEditorStateJsonToHtmlClient` で事前生成した HTML */
  contentHtml: z.string(),
  isPublished: z.boolean(),
  requiredAtReservation: z.boolean(),
  requiredAtInquiry: z.boolean(),
  requiredAtSignup: z.boolean(),
  showInFooter: z.boolean(),
});

export type TermsFormInput = z.infer<typeof termsFormSchema>;
