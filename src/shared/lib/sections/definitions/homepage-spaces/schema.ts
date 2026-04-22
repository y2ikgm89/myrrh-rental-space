import { z } from "zod";
import { field } from "../../field-registry";

export const homepageSpacesConfigSchema = z.object({
  label: field.text("ラベル", { default: "Selected Spaces" }),
  title: field.text("タイトル", { default: "厳選スペース" }),
  count: field.number("表示件数", {
    min: 1,
    max: 12,
    default: 6,
    group: "advanced",
  }),
  autoPlayInterval: field.number("自動切替間隔", {
    min: 0,
    max: 30,
    default: 5,
    suffix: "秒",
    helpText: "0にすると自動切替を無効化します",
    group: "advanced",
  }),
});

export type HomepageSpacesConfig = z.infer<typeof homepageSpacesConfigSchema>;
