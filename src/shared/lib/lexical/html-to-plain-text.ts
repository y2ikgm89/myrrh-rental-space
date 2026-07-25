/**
 * HTML から表示用プレーンテキストを抽出する（SEO description / カード要約 / JSON-LD 用）。
 *
 * - タグを剥がす
 * - ブロック境界と `<br>` を空白に
 * - 連続空白を 1 つに圧縮
 * - HTML エンティティをデコード
 * - 前後トリム
 * - `maxLength` 指定時は末尾を `…` で丸める
 */
import { decodeHtmlEntities } from "@/shared/lib/html/decode-html-entities";

export function stripHtmlToText(html: string, maxLength?: number): string {
  if (!html) return "";

  const withBreaks = html
    .replace(
      /<(br|\/(p|div|h[1-6]|li|ul|ol|blockquote|pre|section|article))\b[^>]*>/gi,
      " ",
    )
    .replace(/<[^>]+>/g, "");

  const decoded = decodeHtmlEntities(withBreaks.replaceAll("&nbsp;", " "));

  const normalized = decoded.replace(/\s+/g, " ").trim();

  if (maxLength !== undefined && normalized.length > maxLength) {
    return `${normalized.slice(0, maxLength - 1)}…`;
  }
  return normalized;
}
