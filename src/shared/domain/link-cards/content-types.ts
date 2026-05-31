/**
 * Link Card — 内部リンクカードのコンテンツ種別 SSoT
 *
 * Prisma enum ではない（複数モデル横断の論理種別）。admin editor（ノード /
 * プラグイン / ダイアログ）と公開描画（resolve-queries /
 * resolve-internal-link-cards）の双方から参照される共有型のため shared/domain に置く。
 */
import { createTypeGuard } from "@/shared/lib/serialize";

export type LinkCardContentType = "post" | "news" | "space" | "event";

export const LINK_CARD_CONTENT_TYPES: readonly LinkCardContentType[] = [
  "post",
  "news",
  "space",
  "event",
] as const;

export const isLinkCardContentType = createTypeGuard<LinkCardContentType>(
  LINK_CARD_CONTENT_TYPES,
);

export const LINK_CARD_TYPE_LABELS: Record<LinkCardContentType, string> = {
  post: "記事",
  news: "お知らせ",
  space: "スペース",
  event: "イベント",
};
