import { z } from "zod";

import { field } from "../../field-helpers";

const layouts = ["grid", "list", "carousel"] as const;
const cardStyles = ["bordered", "shadow", "minimal"] as const;
const imageAspects = ["4:3", "3:2", "16:9"] as const;

export const spaceListConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Spaces" })
    .pipe(z.string().max(50)),
  title: field
    .text("タイトル", { default: "スペース一覧" })
    .pipe(z.string().max(100)),
  maxItems: field.number("最大表示件数", { min: 1, max: 24, default: 6 }),
  showOnlyPublished: field.boolean("公開済みのみ", { default: true }),
  showViewAllLink: field.boolean("全件リンクを表示", { default: true }),
  viewAllText: field
    .text("全件リンクテキスト", { default: "全てのスペースを見る" })
    .pipe(z.string().max(50)),
  viewAllUrl: field
    .text("全件リンクURL", { default: "/spaces" })
    .pipe(z.string().max(200)),
  layout: field.select("レイアウト", {
    options: layouts,
    default: "grid",
  }),
  columns: field.number("カラム数", { min: 1, max: 4, default: 3 }),
  cardStyle: field.select("カードスタイル", {
    options: cardStyles,
    default: "bordered",
  }),
  imageAspect: field.select("画像アスペクト比", {
    options: imageAspects,
    default: "4:3",
  }),
});

export type SpaceListConfig = z.infer<typeof spaceListConfigSchema>;
