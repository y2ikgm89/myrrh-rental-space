import { z } from "zod";

import { field } from "../../field-registry";

const heights = ["sm", "md", "lg"] as const;
const borderRadii = ["none", "sm", "lg"] as const;

export const mapConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "Location",
    maxLength: 50,
  }),
  title: field.text("見出し", { maxLength: 100 }),
  address: field.textarea("住所", { maxLength: 300 }),
  latitude: field.number("緯度", { min: -90, max: 90 }),
  longitude: field.number("経度", { min: -180, max: 180 }),
  zoom: field.number("ズームレベル", {
    min: 1,
    max: 20,
    default: 15,
    helpText: "数値が大きいほど拡大（1: 世界全体、20: 建物レベル）",
    group: "design",
  }),
  height: field.select("地図の高さ", {
    options: heights,
    default: "md",
    group: "design",
  }),
  showAddressBelow: field.boolean("住所を地図の下に表示する", {
    default: true,
  }),
  borderRadius: field.select("角丸", {
    options: borderRadii,
    default: "sm",
    group: "design",
  }),
});

export type MapConfig = z.infer<typeof mapConfigSchema>;
