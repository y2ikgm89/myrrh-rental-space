/**
 * メールテンプレート変数レジストリ
 *
 * 各 EmailTemplateType で使える変数を型安全に定義。
 * 管理画面の「利用可能な変数」ヘルプ表示とランタイムバリデーションに使用。
 */

import {
  EMAIL_TEMPLATE_TYPE,
  type EmailTemplateType,
} from "@/shared/lib/validations/enums/helpers";

export type TemplateVariable = {
  name: string;
  description: string;
  example: string;
};

type VariableMap = Record<EmailTemplateType, readonly TemplateVariable[]>;

const COMMON_RESERVATION: readonly TemplateVariable[] = [
  { name: "customerName", description: "お客様名", example: "山田 太郎" },
  { name: "spaceName", description: "スペース名", example: "渋谷会議室A" },
  {
    name: "reservationDate",
    description: "予約日",
    example: "2026年4月17日 (金曜日)",
  },
  { name: "startTime", description: "開始時刻", example: "14:00" },
  { name: "endTime", description: "終了時刻", example: "16:00" },
  { name: "reservationId", description: "予約ID（短縮）", example: "A1B2C3D4" },
];

const COMMON_EVENT: readonly TemplateVariable[] = [
  { name: "customerName", description: "お客様名", example: "山田 太郎" },
  { name: "eventTitle", description: "イベント名", example: "春の交流会" },
  {
    name: "eventDate",
    description: "開催日",
    example: "2026年5月1日 (金曜日)",
  },
];

export const EMAIL_TEMPLATE_VARIABLES: VariableMap = {
  [EMAIL_TEMPLATE_TYPE.RESERVATION_CONFIRMATION]: [
    ...COMMON_RESERVATION,
    { name: "totalPrice", description: "合計金額", example: "\u00a510,000" },
    { name: "notes", description: "備考", example: "配膳準備あり" },
  ],
  [EMAIL_TEMPLATE_TYPE.RESERVATION_CANCELLED]: COMMON_RESERVATION,
  [EMAIL_TEMPLATE_TYPE.RESERVATION_STATUS_CHANGED]: [
    ...COMMON_RESERVATION,
    { name: "previousStatus", description: "旧ステータス", example: "確認中" },
    { name: "newStatus", description: "新ステータス", example: "確定" },
    { name: "action", description: "アクション名", example: "確定しました" },
  ],
  [EMAIL_TEMPLATE_TYPE.RESERVATION_REMINDER]: COMMON_RESERVATION,
  [EMAIL_TEMPLATE_TYPE.RESERVATION_UPDATED]: COMMON_RESERVATION,
  [EMAIL_TEMPLATE_TYPE.ADMIN_NOTIFICATION]: [
    ...COMMON_RESERVATION,
    {
      name: "customerEmail",
      description: "お客様メール",
      example: "customer@example.com",
    },
    { name: "totalPrice", description: "合計金額", example: "\u00a510,000" },
    {
      name: "adminUrl",
      description: "管理画面URL",
      example: "https://example.com/admin/reservations/...",
    },
  ],
  [EMAIL_TEMPLATE_TYPE.EVENT_REGISTRATION_CONFIRMATION]: [
    ...COMMON_EVENT,
    { name: "startTime", description: "開始時刻", example: "14:00" },
    { name: "endTime", description: "終了時刻", example: "16:00" },
    { name: "location", description: "開催場所", example: "渋谷会議室A" },
    { name: "registrationId", description: "申込ID", example: "E1F2G3H4" },
  ],
  [EMAIL_TEMPLATE_TYPE.EVENT_REGISTRATION_CANCELLED]: [
    ...COMMON_EVENT,
    { name: "registrationId", description: "申込ID", example: "E1F2G3H4" },
  ],
  [EMAIL_TEMPLATE_TYPE.EVENT_ADMIN_NOTIFICATION]: [
    ...COMMON_EVENT,
    {
      name: "customerEmail",
      description: "お客様メール",
      example: "customer@example.com",
    },
    { name: "registrationId", description: "申込ID", example: "E1F2G3H4" },
    {
      name: "adminUrl",
      description: "管理画面URL",
      example: "https://example.com/admin/events/...",
    },
  ],
  [EMAIL_TEMPLATE_TYPE.EVENT_CANCELLED_NOTIFICATION]: [
    ...COMMON_EVENT,
    { name: "reason", description: "中止理由", example: "やむを得ない事情" },
  ],
  [EMAIL_TEMPLATE_TYPE.EVENT_UPDATED_NOTIFICATION]: [
    ...COMMON_EVENT,
    { name: "startTime", description: "開始時刻", example: "14:00" },
    { name: "endTime", description: "終了時刻", example: "16:00" },
    { name: "location", description: "開催場所", example: "渋谷会議室A" },
    {
      name: "changeSummary",
      description: "変更内容",
      example: "開催時刻が変更されました",
    },
  ],
  [EMAIL_TEMPLATE_TYPE.CONTACT_CONFIRMATION]: [
    { name: "customerName", description: "お客様名", example: "山田 太郎" },
    {
      name: "inquirySubject",
      description: "お問い合わせ件名",
      example: "スペース利用について",
    },
    { name: "inquiryId", description: "お問い合わせID", example: "I1J2K3L4" },
  ],
  [EMAIL_TEMPLATE_TYPE.INQUIRY_REPLY]: [
    { name: "customerName", description: "お客様名", example: "山田 太郎" },
    {
      name: "inquirySubject",
      description: "お問い合わせ件名",
      example: "スペース利用について",
    },
    {
      name: "replyMessage",
      description: "返信本文",
      example: "ご質問ありがとうございます...",
    },
    { name: "inquiryId", description: "お問い合わせID", example: "I1J2K3L4" },
  ],
  [EMAIL_TEMPLATE_TYPE.REVIEW_REPLY]: [
    { name: "customerName", description: "お客様名", example: "山田 太郎" },
    { name: "spaceName", description: "スペース名", example: "渋谷会議室A" },
    { name: "reviewRating", description: "評価", example: "5" },
    {
      name: "reviewComment",
      description: "レビューコメント",
      example: "とても快適でした",
    },
    {
      name: "replyMessage",
      description: "返信本文",
      example: "嬉しいお言葉ありがとうございます",
    },
  ],
  [EMAIL_TEMPLATE_TYPE.WELCOME]: [
    { name: "customerName", description: "お客様名", example: "山田 太郎" },
    {
      name: "loginUrl",
      description: "ログインURL",
      example: "https://example.com/login",
    },
  ],
  [EMAIL_TEMPLATE_TYPE.PASSWORD_RESET]: [
    { name: "customerName", description: "お客様名", example: "山田 太郎" },
    {
      name: "resetUrl",
      description: "リセットURL",
      example: "https://example.com/reset?token=...",
    },
    {
      name: "expiresInHours",
      description: "有効時間（時間）",
      example: "24",
    },
  ],
  [EMAIL_TEMPLATE_TYPE.STAFF_INVITATION]: [
    { name: "inviterName", description: "招待者名", example: "管理者" },
    { name: "role", description: "ロール", example: "編集者" },
    {
      name: "invitationUrl",
      description: "招待URL",
      example: "https://example.com/invite?token=...",
    },
    {
      name: "expiresAt",
      description: "有効期限",
      example: "2026年4月24日 23:59",
    },
  ],
};

export function getTemplateVariables(
  type: EmailTemplateType,
): readonly TemplateVariable[] {
  return EMAIL_TEMPLATE_VARIABLES[type];
}
