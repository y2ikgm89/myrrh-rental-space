/**
 * セクション共通ヘッダーフィールド factory（sectionLabel + title）
 *
 * 多数のセクション（cta / features / event-calendar / reservation-form /
 * contact-form / testimonial / value-props 以外の content セクション 等）が
 * 同一形状の `sectionLabel` (text) + `title` (portableTextInline) を冒頭に持つ。
 * factory 化することで:
 *  - 文言・maxLength・subGroup の意図しない drift を防ぐ
 *  - 新規セクション追加時のボイラープレートを削減する
 *
 * `sectionLabelDefault` のみセクション固有なので、それを受け取って残りは
 * 共通化する。spread して各 schema に注入する。
 *
 * 例:
 * ```ts
 * export const ctaConfigSchema = z.object({
 *   ...sectionHeaderFields({ sectionLabelDefault: "Ready to Begin?" }),
 *   // ...
 * });
 * ```
 */

import { field } from "../../field-registry";

export function sectionHeaderFields({
  sectionLabelDefault,
}: {
  readonly sectionLabelDefault: string;
}) {
  return {
    sectionLabel: field.text("セクションラベル", {
      default: sectionLabelDefault,
      maxLength: 50,
      subGroup: "text",
    }),
    title: field.portableTextInline("見出し", {
      subGroup: "text",
    }),
  };
}
