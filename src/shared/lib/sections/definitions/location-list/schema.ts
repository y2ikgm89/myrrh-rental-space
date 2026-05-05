import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

const chapterLayouts = ["alternating", "stacked"] as const;
const locationModes = ["all", "selected"] as const;

export const locationListConfigSchema = z.object({
  // セクション見出し（Section共通: 上部の eyebrow + heading）
  sectionLabel: field.text("セクションラベル", {
    default: "Locations",
    maxLength: 50,
    subGroup: "text",
  }),
  title: field.text("セクション見出し", {
    default: "全拠点のご案内",
    maxLength: 100,
    subGroup: "text",
  }),

  // 拠点選択
  mode: field.select("表示拠点", {
    options: locationModes,
    default: "all",
    helpText: "all=公開中の全拠点 / selected=指定 slug のみ",
    group: "content",
  }),
  locationSlugs: field.array("表示する拠点 slug（mode=selected 時のみ有効）", {
    fields: { slug: z.string().min(1).max(100) },
    helpText: "Location 管理で発行された slug を順序通りに指定",
    group: "content",
  }),

  // Overview anchor ナビ
  overviewNavEnabled: field.boolean("拠点アンカーナビを表示", {
    default: true,
    helpText: "ページ内で拠点へジャンプする目次（拠点 2 件以上で意味あり）",
    group: "design",
  }),
  overviewHeadline: field.text("ナビ見出し（省略可）", {
    default: "",
    maxLength: 100,
    helpText: "未指定時は拠点数に応じて自動生成",
    subGroup: "text",
  }),

  // 代表連絡先（旧 AccessGlobalInfo）
  globalContactEnabled: field.boolean("代表お問い合わせを表示", {
    default: true,
    helpText: "Settings の電話 / メールを章の上に表示",
    group: "design",
  }),
  globalContactHeadline: field.text("代表お問い合わせ見出し", {
    default: "代表お問い合わせ",
    maxLength: 100,
    subGroup: "text",
  }),

  // 章レイアウト
  chapterLayout: field.select("章レイアウト", {
    options: chapterLayouts,
    default: "alternating",
    helpText: "alternating=現行の縦型 Editorial / stacked=画像上部固定",
    group: "design",
  }),

  layout: sectionLayoutSchema,
});

export type LocationListConfig = z.infer<typeof locationListConfigSchema>;
