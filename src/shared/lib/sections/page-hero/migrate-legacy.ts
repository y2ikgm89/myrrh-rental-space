/**
 * 旧 `homepage-hero` Section の config から、`Page.pageHero` に保存する JSON ペイロードを組み立てる。
 *
 * Prisma マイグレーションの UPDATE 式と同じキー／同じ既定値を再現する（検証・seed 補助用）。
 *
 * @see prisma/migrations/20260422103000_add_page_hero_and_remove_homepage_hero_section/migration.sql
 */

import { isRecord } from "@/shared/lib/serialize";

/**
 * レガシー Section.config（homepage-hero）を pageHero 生オブジェクトに変換する。
 * 戻り値は `parsePageHero` / `pageHeroSchema` で検証可能な形（images 空は editorial-split で緩和対象）。
 */
export function buildPageHeroPayloadFromLegacyHomepageHeroConfig(
  config: unknown,
): Record<string, unknown> {
  const c = isRecord(config) ? config : {};
  const images = c["images"];
  const transitionRaw =
    c["transition"] != null ? String(c["transition"]) : "crossfade";

  return {
    variant: "editorial-split",
    label: c["label"] != null ? String(c["label"]) : "",
    title: c["title"] != null ? String(c["title"]) : "",
    description: c["description"] != null ? String(c["description"]) : "",
    images: Array.isArray(images) ? images : [],
    transition: transitionRaw.length > 0 ? transitionRaw : "crossfade",
    buttonText: c["buttonText"] != null ? String(c["buttonText"]) : "",
    buttonUrl: c["buttonUrl"] != null ? String(c["buttonUrl"]) : "",
  };
}
