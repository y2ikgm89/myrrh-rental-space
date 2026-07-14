/**
 * メールテンプレート レジストリ — 値（SSoT）
 *
 * client / server 両方から import される pure data。`server-only` を絶対に付けない
 * （client component から import される）。値の追加はここに一元化:
 *
 * 1. `TEMPLATE_KEYS` に key を追加（`as const`）
 * 2. `EMAIL_TEMPLATE_INDEX_DATA` に同 key の {label, description, category} を追加
 *
 * `TemplateKey` 型は `TEMPLATE_KEYS` 配列から派生し、`EMAIL_TEMPLATE_REGISTRY`
 * （server-only）は `satisfies Record<TemplateKey, …>` で抜けを compile error 化する。
 * Zod schema は `z.enum(TEMPLATE_KEYS, …)` で SSoT 直参照。
 */

/** 全 23 エントリの key 列挙。`as const` で literal tuple として固定。 */
export const TEMPLATE_KEYS = [
  "reservation-confirmation",
  "reservation-updated",
  "reservation-cancelled",
  "reservation-status-changed",
  "reservation-reminder",
  "event-registration-confirmation",
  "event-registration-cancelled",
  "event-cancelled-notification",
  "event-updated-notification",
  "event-reminder",
  "event-admin-notification",
  "event-waitlist-registered",
  "event-waitlist-offered",
  "event-waitlist-expired",
  "contact-confirmation",
  "inquiry-reply",
  "inquiry-status-notification",
  "admin-notification-reservation",
  "admin-notification-inquiry",
  "welcome",
  "delete-account-verification",
  "review-reply",
  "__infra_check",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

const TEMPLATE_KEY_SET = new Set<string>(TEMPLATE_KEYS);

export function isTemplateKey(value: unknown): value is TemplateKey {
  return typeof value === "string" && TEMPLATE_KEY_SET.has(value);
}

export type TemplateCategory =
  "reservation" | "event" | "inquiry" | "account" | "system";

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  reservation: "予約",
  event: "イベント",
  inquiry: "お問い合わせ・レビュー",
  account: "アカウント",
  system: "システム",
};

export interface EmailTemplateIndexItem {
  key: TemplateKey;
  label: string;
  description: string;
  category: TemplateCategory;
}

/**
 * 各エントリのメタデータ（UI 表示・テスト送信 subject の SSoT）。
 * `satisfies` で TemplateKey 全網羅を compile-time に enforce。
 */
export const EMAIL_TEMPLATE_INDEX: ReadonlyArray<EmailTemplateIndexItem> = [
  {
    key: "reservation-confirmation",
    label: "予約確認",
    description: "予約確定時にお客様へ送信。",
    category: "reservation",
  },
  {
    key: "reservation-updated",
    label: "予約内容変更",
    description:
      "予約内容（日時・スペース・料金等）が変更された時にお客様へ送信。",
    category: "reservation",
  },
  {
    key: "reservation-cancelled",
    label: "予約キャンセル",
    description: "予約がキャンセルされた時にお客様へ送信。",
    category: "reservation",
  },
  {
    key: "reservation-status-changed",
    label: "予約ステータス更新",
    description: "ステータスが変更された時にお客様へ送信。",
    category: "reservation",
  },
  {
    key: "reservation-reminder",
    label: "予約リマインダー",
    description: "予約前日にお客様へ送信（cron）。",
    category: "reservation",
  },
  {
    key: "event-registration-confirmation",
    label: "イベント申込確認",
    description: "イベント申込時にお客様へ送信。",
    category: "event",
  },
  {
    key: "event-registration-cancelled",
    label: "イベント申込キャンセル",
    description: "申込がキャンセルされた時にお客様へ送信。",
    category: "event",
  },
  {
    key: "event-cancelled-notification",
    label: "イベント中止のお知らせ",
    description: "開催中止時に申込済み全員へ送信。",
    category: "event",
  },
  {
    key: "event-updated-notification",
    label: "イベント内容変更のお知らせ",
    description: "イベント情報が変更された時に申込済み全員へ送信。",
    category: "event",
  },
  {
    key: "event-reminder",
    label: "イベント前日リマインダー",
    description: "開催前日に参加者へ送信（cron・設定でON/OFF可）。",
    category: "event",
  },
  {
    key: "event-admin-notification",
    label: "イベント管理者通知",
    description: "新規申込・キャンセル時に管理者へ送信。",
    category: "event",
  },
  {
    key: "event-waitlist-registered",
    label: "キャンセル待ち登録",
    description: "満員のためキャンセル待ちに登録した時にお客様へ送信。",
    category: "event",
  },
  {
    key: "event-waitlist-offered",
    label: "繰り上げ当選のお知らせ",
    description:
      "キャンセルにより空きが出て繰り上げ当選した時にお客様へ送信（24h 以内要手続き）。",
    category: "event",
  },
  {
    key: "event-waitlist-expired",
    label: "繰り上げ当選の期限切れ",
    description:
      "繰り上げ当選の手続き期限が過ぎ、次の方へ案内された時にお客様へ送信。",
    category: "event",
  },
  {
    key: "contact-confirmation",
    label: "お問い合わせ受付",
    description: "お問い合わせ送信時にお客様へ送信。",
    category: "inquiry",
  },
  {
    key: "inquiry-reply",
    label: "お問い合わせ回答",
    description: "管理者がお問い合わせに返信した時にお客様へ送信。",
    category: "inquiry",
  },
  {
    key: "inquiry-status-notification",
    label: "お問い合わせ完了/終了",
    description: "ステータスが RESOLVED/CLOSED になった時にお客様へ送信。",
    category: "inquiry",
  },
  {
    key: "admin-notification-reservation",
    label: "管理者通知（予約）",
    description: "新規予約・更新・キャンセル時に管理者へ送信。",
    category: "inquiry",
  },
  {
    key: "admin-notification-inquiry",
    label: "管理者通知（お問い合わせ）",
    description: "新規お問い合わせ時に管理者へ送信。",
    category: "inquiry",
  },
  {
    key: "welcome",
    label: "会員登録ウェルカム",
    description: "会員登録完了時にお客様へ送信。",
    category: "account",
  },
  {
    key: "delete-account-verification",
    label: "アカウント削除の確認",
    description: "マイページからのアカウント削除申請時にお客様へ送信。",
    category: "account",
  },
  {
    key: "review-reply",
    label: "レビュー返信",
    description: "管理者がレビューに返信した時にお客様へ送信。",
    category: "inquiry",
  },
  {
    key: "__infra_check",
    label: "メール基盤動作確認（インフラチェック）",
    description:
      "Resend simulator アドレスや任意の宛先に送って、SPF/DKIM/DMARC・送信元ドメイン認証の疎通を確認するためのテストメール。",
    category: "system",
  },
] satisfies ReadonlyArray<EmailTemplateIndexItem>;

// Compile-time exhaustiveness: INDEX が TEMPLATE_KEYS の全 key を網羅することを enforce。
type IndexKey = (typeof EMAIL_TEMPLATE_INDEX)[number]["key"];
type MissingIndexKeys = Exclude<TemplateKey, IndexKey>;
type ExtraIndexKeys = Exclude<IndexKey, TemplateKey>;
type _IndexCheck = [MissingIndexKeys, ExtraIndexKeys] extends [never, never]
  ? true
  : never;
const _INDEX_KEYS_EXHAUSTIVE: _IndexCheck = true;
void _INDEX_KEYS_EXHAUSTIVE;
