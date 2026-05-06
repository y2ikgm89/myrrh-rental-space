import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

const iconStyles = ["tabler", "none"] as const;

export const valuePropsConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "",
    maxLength: 50,
    subGroup: "text",
    helpText: "空のときラベル行を非表示",
  }),
  title: field.text("見出し", {
    default: "",
    maxLength: 100,
    subGroup: "text",
    helpText: "空のとき見出しを非表示（バンドのみ表示）",
  }),
  items: field.array("項目", {
    subGroup: "text",
    fields: {
      icon: field.icon("アイコン"),
      title: field.text("ラベル"),
    },
  }),
  iconStyle: field.select("アイコンスタイル", {
    options: iconStyles,
    default: "tabler",
    group: "design",
  }),
  layout: sectionLayoutSchema,
});

export type ValuePropsConfig = z.infer<typeof valuePropsConfigSchema>;
