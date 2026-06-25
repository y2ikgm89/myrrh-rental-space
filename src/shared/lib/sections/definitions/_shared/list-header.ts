/**
 * list セクション共通ヘッダーフィールド factory
 *
 * news-list / post-list / space-list / faq-list は共通して
 * `sectionLabel` / `title` / `maxItems` / `showViewAllLink` / `viewAllText` /
 * `viewAllUrl` の 6 field を冒頭に持つ。本 factory はその 6 field を一括生成
 * し、各 schema は spread して残りのセクション固有 field（layout/columns 等）
 * を続ける。
 *
 * セクション間の差分は 3 パラメタに集約:
 *  - `sectionLabelDefault`: 「Spaces」「News」「Blog」「FAQ」等
 *  - `defaultViewAllUrl`: `/spaces` / `/news` / `/blog` / `/faq`
 *  - `maxItemsCap`: 上限件数（news/post=20、space=24、faq=50）
 *  - `maxItemsDefault`: 初期件数（news=5、post=6、space=6、faq=10）
 *
 * 例:
 * ```ts
 * export const newsListConfigSchema = z.object({
 *   ...listSectionHeaderFields({
 *     sectionLabelDefault: "News",
 *     defaultViewAllUrl: "/news",
 *     maxItemsCap: 20,
 *     maxItemsDefault: 5,
 *   }),
 *   // ...
 * });
 * ```
 */

import { field } from "../../field-registry";

interface ListSectionHeaderFieldsOpts {
  readonly sectionLabelDefault: string;
  readonly defaultViewAllUrl: string;
  /** `maxItems.max` 上限。指定なしは 20（news/post 既定） */
  readonly maxItemsCap?: number;
  /** `maxItems.default` 初期値。指定なしは 6 */
  readonly maxItemsDefault?: number;
}

export function listSectionHeaderFields({
  sectionLabelDefault,
  defaultViewAllUrl,
  maxItemsCap = 20,
  maxItemsDefault = 6,
}: ListSectionHeaderFieldsOpts) {
  return {
    sectionLabel: field.text("セクションラベル", {
      default: sectionLabelDefault,
      maxLength: 50,
      subGroup: "text",
    }),
    title: field.portableTextInline("見出し", {
      subGroup: "text",
    }),
    maxItems: field.number("最大表示件数", {
      min: 1,
      max: maxItemsCap,
      default: maxItemsDefault,
      suffix: "件",
      group: "advanced",
    }),
    showViewAllLink: field.boolean("「すべて見る」リンクを表示する", {
      default: true,
    }),
    viewAllText: field.portableTextInline("「すべて見る」リンクの文字", {
      subGroup: "button",
    }),
    viewAllUrl: field.text("「すべて見る」リンク先 URL", {
      default: defaultViewAllUrl,
      maxLength: 200,
      subGroup: "button",
    }),
  };
}
