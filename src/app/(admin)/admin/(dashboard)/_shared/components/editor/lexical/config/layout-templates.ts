/**
 * カラムレイアウト（LayoutContainerNode）のテンプレート定義。
 * 挿入ダイアログ・インスペクター・ツールバー・列数同期で同一ソースを参照する。
 */

/** `lexical-content.css` の `@media (max-width: …)` と一致させる */
export const LAYOUT_BREAKPOINT_MAX_PX = 768 as const;

export const LAYOUT_TEMPLATES = [
  {
    value: "1fr 1fr",
    label: "2カラム（均等）",
    columns: 2,
    description: "50% / 50%",
  },
  {
    value: "1fr 1fr 1fr",
    label: "3カラム（均等）",
    columns: 3,
    description: "33% / 33% / 33%",
  },
  {
    value: "2fr 1fr",
    label: "2カラム（2:1）",
    columns: 2,
    description: "66% / 33%",
  },
  {
    value: "1fr 2fr",
    label: "2カラム（1:2）",
    columns: 2,
    description: "33% / 66%",
  },
  {
    value: "1fr 1fr 1fr 1fr",
    label: "4カラム（均等）",
    columns: 4,
    description: "25% / 25% / 25% / 25%",
  },
] as const;

export type LayoutTemplateEntry = (typeof LAYOUT_TEMPLATES)[number];

export type LayoutTemplateValue = LayoutTemplateEntry["value"];

/**
 * 狭いビューポート用 `grid-template-columns`（`--lexical-layout-mobile` にバインド）
 */
export const LAYOUT_NARROW_TEMPLATES = [
  {
    value: "1fr",
    label: "1列（縦積み）",
    description: "モバイルで全幅スタック",
  },
  {
    value: "1fr 1fr",
    label: "2列（均等）",
    description: "狭い画面でも2カラム",
  },
  {
    value: "1fr 1fr 1fr",
    label: "3列（均等）",
    description: "3カラム維持",
  },
] as const;

export type LayoutNarrowTemplateEntry = (typeof LAYOUT_NARROW_TEMPLATES)[number];

/**
 * `grid-template-columns` 相当の空白区切りトークン数から列数を得る。
 * 不正・空文字は最低 1 列に丸める（トランスフォーマの安定化用）。
 */
export function getColumnsFromTemplate(template: string): number {
  const n = template.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, n);
}
