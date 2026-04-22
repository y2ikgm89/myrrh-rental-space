import { z } from "zod";
import { field } from "../../field-registry";

export const homepageFeaturesConfigSchema = z.object({
  label: field.text("ラベル", { default: "Why Myrrh" }),
  title: field.text("タイトル", { default: "選ばれる理由" }),
  items: field.array("特長リスト", {
    fields: {
      title: field.text("タイトル"),
      description: field.textarea("説明文"),
    },
  }),
});

export type HomepageFeaturesConfig = z.infer<
  typeof homepageFeaturesConfigSchema
>;
