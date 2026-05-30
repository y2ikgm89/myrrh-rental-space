/**
 * Link Card — 内部リンクカードのコンテンツ種別 SSoT
 *
 * Prisma enum ではないため（複数モデル横断の論理種別）、ノード config 配下に定義する。
 */
import { createEnumGuard } from "./type-guards";

export type LinkCardContentType = "post" | "news" | "space" | "event";

export const LINK_CARD_CONTENT_TYPES: readonly LinkCardContentType[] = [
  "post",
  "news",
  "space",
  "event",
] as const;

export const isLinkCardContentType = createEnumGuard<LinkCardContentType>(
  LINK_CARD_CONTENT_TYPES,
);

export const LINK_CARD_TYPE_LABELS: Record<LinkCardContentType, string> = {
  post: "記事",
  news: "お知らせ",
  space: "スペース",
  event: "イベント",
};
