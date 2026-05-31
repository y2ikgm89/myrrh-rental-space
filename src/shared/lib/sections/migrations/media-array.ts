/**
 * 旧形式の単一メディア group `{ url, alt, caption }` を配列形式に正規化する純粋関数。
 *
 * hero / page-hero の背景メディアを単一 → 配列にクリーンブレイクした際の
 * 一度きり DB 移行（`scripts/migrate-hero-background-media-to-array.ts`）で使う。
 * コード（schema）側には互換シムを持たないため、この変換は移行スクリプト専用。
 */

import { isRecord } from "@/shared/lib/serialize";

interface MediaItem {
  url: string;
  alt: string;
  caption: string;
}

export function toMediaArray(value: unknown): MediaItem[] {
  if (Array.isArray(value)) return value as MediaItem[];
  if (!isRecord(value)) return [];

  const url = typeof value["url"] === "string" ? value["url"] : "";
  if (url.length === 0) return [];

  const alt = typeof value["alt"] === "string" ? value["alt"] : "";
  const caption = typeof value["caption"] === "string" ? value["caption"] : "";
  return [{ url, alt, caption }];
}
