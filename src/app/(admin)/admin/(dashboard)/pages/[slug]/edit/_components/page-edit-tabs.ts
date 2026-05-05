/**
 * ページ編集画面のタブ定義 SSoT
 *
 * `PageEditor` のタブと nuqs パーサーが共通参照する。
 */

export const PAGE_EDIT_TAB_VALUES = ["content", "seo"] as const satisfies [
  string,
  ...string[],
];

export type PageEditTabValue = (typeof PAGE_EDIT_TAB_VALUES)[number];

export const PAGE_EDIT_TAB_LABELS: Record<PageEditTabValue, string> = {
  content: "コンテンツ",
  seo: "SEO・OGP",
};

/** Tabs の `onValueChange` から nuqs 用リテラルへ絞り込む */
export function parsePageEditTabValue(value: string): PageEditTabValue | null {
  for (const tab of PAGE_EDIT_TAB_VALUES) {
    if (tab === value) return tab;
  }
  return null;
}
