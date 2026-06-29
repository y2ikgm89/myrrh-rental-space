/**
 * リソース定義（client-safe）
 *
 * permissions.ts（server-only チェーン）から分離した SSoT。
 * admin-roles.ts ↔ admin-auth.ts と同じ分離パターン。
 *
 * shared 配下に置く理由: shared/domain の query helper（admin-search / audit-recents 等）
 * から型として参照されるため、shared/lib に集約。admin 層からは `@/shared/lib/admin-resources`
 * 経由で参照する。
 */

export type Resource =
  | "space"
  | "location"
  | "spaceCategory"
  | "reservation"
  | "customer"
  | "inquiry"
  | "post"
  | "news"
  | "page"
  | "faq"
  | "terms"
  | "settings"
  | "user"
  | "auditLog"
  | "navigation"
  | "announcementBar"
  | "media"
  | "coupon"
  | "blockTemplate"
  | "review"
  | "event"
  | "notification";

export type Action =
  "create" | "read" | "update" | "delete" | "publish" | "manage";

export const RESOURCE_LABELS: Record<Resource, string> = {
  space: "スペース",
  location: "場所",
  spaceCategory: "スペースカテゴリー",
  reservation: "予約",
  customer: "顧客",
  inquiry: "お問い合わせ",
  post: "投稿",
  news: "お知らせ",
  page: "固定ページ",
  faq: "FAQ",
  terms: "利用規約",
  settings: "設定",
  user: "ユーザー",
  auditLog: "監査ログ",
  navigation: "ナビゲーション",
  announcementBar: "お知らせバー",
  media: "メディア",
  coupon: "クーポン",
  blockTemplate: "ブロックテンプレート",
  review: "レビュー",
  event: "イベント",
  notification: "通知",
};
