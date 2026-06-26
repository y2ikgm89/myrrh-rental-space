import { z } from "zod";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";
import {
  LayoutWidth,
  TermsScope,
} from "@/shared/lib/validations/enums/prisma-types";

/**
 * 規約本文のコンテンツ幅（固定）。
 *
 * 公開 `/terms/[slug]` ページの描画幅と、管理画面 InlineEditor が本文を
 * 表示する幅（Lexical `contentWidth`）の SSoT。両者がこの値を参照することで
 * 執筆時のエディタ表示幅と公開結果の WYSIWYG を一致させる。
 * 規約は可変幅にせず長文ドキュメント向けの MD 固定とする。
 */
export const TERMS_CONTENT_WIDTH = LayoutWidth.MD;

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

/**
 * 規約 scope のラベル/説明文 SSoT。
 *
 * 旧 `requiredAtReservation/Inquiry/Signup` 3 boolean を `scopes: TermsScope[]`
 * 配列に統合した際の UI 用ラベル定義。管理画面の scope multi-select と
 * 一覧バッジが本定義を参照する。
 *
 * description は配線先 URL を明記し編集者が誤配線しないようにする。
 */
export const TERMS_SCOPE_VALUES = [
  TermsScope.LOGIN_SIGNUP,
  TermsScope.RESERVATION,
  TermsScope.INQUIRY,
  TermsScope.EVENT_REGISTRATION,
] as const;

export const TERMS_SCOPE_LABELS: Record<TermsScope, string> = {
  [TermsScope.LOGIN_SIGNUP]: "ログイン (社会ログイン新規登録)",
  [TermsScope.RESERVATION]: "スペース予約フォーム",
  [TermsScope.INQUIRY]: "お問い合わせフォーム",
  [TermsScope.EVENT_REGISTRATION]: "イベント申込フォーム",
};

export const TERMS_SCOPE_DESCRIPTIONS: Record<TermsScope, string> = {
  [TermsScope.LOGIN_SIGNUP]:
    "/login で Google / LINE 新規ログイン時にチェック必須",
  [TermsScope.RESERVATION]: "/reservation の Step3 (お客様情報) でチェック必須",
  [TermsScope.INQUIRY]: "/contact など contact-form セクションでチェック必須",
  [TermsScope.EVENT_REGISTRATION]:
    "/events/[slug] の申込フォームでチェック必須",
};

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

const termsScopeSchema = z.enum(
  [
    TermsScope.LOGIN_SIGNUP,
    TermsScope.RESERVATION,
    TermsScope.INQUIRY,
    TermsScope.EVENT_REGISTRATION,
  ] as const,
  { error: "不正な scope です" },
);

/**
 * 規約作成・編集フォームスキーマ
 *
 * `footerOrder` はシステム管理（D&D 並び替えが SSoT、手動入力なし）。
 * `scopes` は重複を許さず TermsScope enum 値のみ受理する。
 */
export const termsFormSchema = z.object({
  type: typeSchema,
  slug: slugSchema,
  title: titleSchema,
  contentJson: lexicalJsonSchema,
  /** クライアント側 `renderEditorStateJsonToHtmlClient` で事前生成した HTML */
  contentHtml: z.string(),
  isPublished: z.boolean(),
  /** 同意必須にする scope 配列 (空配列なら consent UI に出さない・フッター掲載のみ可) */
  scopes: z.array(termsScopeSchema).default([]),
  /** 改訂時の周知文 (任意・将来 mypage 通知で利用) */
  changelog: z.string().max(2000).nullable().default(null),
  showInFooter: z.boolean(),
});

export type TermsFormInput = z.infer<typeof termsFormSchema>;
export type TermsScopeValue = TermsScope;
