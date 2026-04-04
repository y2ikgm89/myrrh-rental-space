import { z } from "zod";
import { field } from "../../field-helpers";

export const homepageSpacesConfigSchema = z.object({
  label: field.text("ラベル", { default: "Selected Spaces" }),
  title: field.text("タイトル", { default: "厳選スペース" }),
  count: field.number("表示件数", { min: 1, max: 12, default: 6 }),
});

export type HomepageSpacesConfig = z.infer<typeof homepageSpacesConfigSchema>;
