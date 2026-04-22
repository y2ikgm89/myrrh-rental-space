import { z } from "zod";

import { field } from "../../field-registry";

const heights = ["sm", "md", "lg"] as const;
const borderRadii = ["none", "sm", "lg"] as const;

export const mapConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Location" })
    .pipe(z.string().max(50)),
  title: field.text("タイトル").pipe(z.string().max(100)),
  address: field.textarea("住所").pipe(z.string().max(300)),
  latitude: field.number("緯度", { min: -90, max: 90 }),
  longitude: field.number("経度", { min: -180, max: 180 }),
  zoom: field.number("ズームレベル", {
    min: 1,
    max: 20,
    default: 15,
    group: "advanced",
  }),
  height: field.select("高さ", {
    options: heights,
    default: "md",
    group: "design",
  }),
  showAddressBelow: field.boolean("住所を下部に表示", { default: true }),
  borderRadius: field.select("角丸", {
    options: borderRadii,
    default: "sm",
    group: "design",
  }),
});

export type MapConfig = z.infer<typeof mapConfigSchema>;
