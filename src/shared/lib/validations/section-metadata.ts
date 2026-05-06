/**
 * セクション表示メタデータ
 *
 * レジストリ（registry.ts）へ委譲する薄いラッパー。
 * 旧 API（sectionTypeLabels 等）との互換を維持しつつ、
 * 定義の正本はファイルベースレジストリに一元化する。
 */

import {
  getAllSectionDefinitions,
  getSectionDefinitionsByCategory,
} from "@/shared/lib/sections/registry";
import type { SectionCategory } from "@/shared/lib/sections/types";

export type { SectionCategory } from "@/shared/lib/sections/types";

// =============================================================================
// カテゴリラベル（admin UI 表示用 — レジストリ非依存）
// =============================================================================

export const sectionCategoryLabels: Record<SectionCategory, string> = {
  hero: "ヒーロー",
  content: "コンテンツ",
  list: "一覧表示",
  functional: "CTA・フォーム",
  media: "メディア・埋め込み",
};

// =============================================================================
// レジストリ委譲ラッパー（互換 API）
// =============================================================================

/** レジストリから動的生成する labels マップ */
export const sectionTypeLabels: Partial<Record<string, string>> =
  Object.fromEntries(
    getAllSectionDefinitions().map((d) => [d.type, d.metadata.label]),
  );

/** レジストリから動的生成する descriptions マップ */
export const sectionTypeDescriptions: Partial<Record<string, string>> =
  Object.fromEntries(
    getAllSectionDefinitions().map((d) => [d.type, d.metadata.description]),
  );

/** レジストリから動的生成する icons マップ */
export const sectionTypeIcons: Partial<Record<string, string>> =
  Object.fromEntries(
    getAllSectionDefinitions().map((d) => [d.type, d.metadata.icon]),
  );

/** レジストリから動的生成する categories マップ */
export const sectionTypeCategories: Partial<Record<string, SectionCategory>> =
  Object.fromEntries(
    getAllSectionDefinitions().map((d) => [d.type, d.metadata.category]),
  );

/** カテゴリ順にセクションタイプをグループ化（レジストリ委譲） */
export const sectionTypesByCategory: {
  category: SectionCategory;
  label: string;
  types: string[];
}[] = (
  ["hero", "content", "list", "functional", "media"] satisfies SectionCategory[]
).map((category) => {
  const grouped = getSectionDefinitionsByCategory();
  return {
    category,
    label: sectionCategoryLabels[category],
    types: (grouped[category] ?? []).map((d) => d.type),
  };
});
