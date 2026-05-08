/**
 * value-props セクション schema (Editorial Hairline Strip)
 *
 * Hero と showcase の間に置かれる USP 帯。
 * Aesop / Hermès / Apple のスペックストリップ準拠の hairline grid 構造を強制する。
 *
 * 設計契約:
 *  - 各 item は `icon`（Tabler Icons）+ `eyebrow`（serif italic 英語ラベル）+ `title`（sans 日本語ラベル）の 3 層
 *  - items は 2 件以上 4 件以下（業界標準 Apple / Aesop / Hermès の USP 数）
 *  - sectionLabel / title / iconStyle は廃止（hairline strip は header なしで自立する editorial pattern）
 */

import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

export const valuePropsConfigSchema = z.object({
  items: field.array("項目", {
    subGroup: "text",
    min: 2,
    max: 4,
    helpText: "推奨は 4 項目（業界標準: Apple / Aesop / Hermès）",
    fields: {
      icon: field.icon("アイコン"),
      eyebrow: field.text("英語ラベル (eyebrow)", {
        maxLength: 24,
        helpText: "serif italic で表示される短い英語ラベル（例: Speed）",
      }),
      title: field.portableTextInline("日本語ラベル", {
        helpText: "sans-serif で表示されるラベル（例: 最短1時間から）",
      }),
    },
  }),
  layout: sectionLayoutSchema,
});

export type ValuePropsConfig = z.infer<typeof valuePropsConfigSchema>;
