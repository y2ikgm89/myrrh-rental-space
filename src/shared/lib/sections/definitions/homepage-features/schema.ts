import { z } from "zod";
import { field } from "../../field-registry";

export const homepageFeaturesConfigSchema = z.object({
  label: field.text("ラベル", { default: "Why Myrrh", subGroup: "text" }),
  title: field.text("見出し", { default: "選ばれる理由", subGroup: "text" }),
  items: field.array("特長リスト", {
    subGroup: "text",
    fields: {
      title: field.text("項目の見出し"),
      description: field.textarea("説明文"),
    },
  }),
});

export type HomepageFeaturesConfig = z.infer<
  typeof homepageFeaturesConfigSchema
>;
