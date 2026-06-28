import { z } from "zod";

import { field, fieldRegistry } from "../../field-registry";
import { isAllowedContentEmbedUrl } from "@/shared/lib/constants/frame-sources";
import { sectionLayoutSchema } from "../_shared/layout";
import { sectionHeaderFields } from "../_shared/section-header";

const aspectRatios = ["16:9", "4:3", "1:1", "auto"] as const;
const borderRadii = ["none", "sm", "lg"] as const;
const embedUrlSchema = z
  .url({ error: "有効なURLを入力してください" })
  .or(z.literal(""))
  .refine(isAllowedContentEmbedUrl, {
    error: "対応している埋め込みURLのみ指定できます",
  })
  .default("")
  .register(fieldRegistry, {
    fieldType: "url",
    label: "埋め込み URL",
    group: "content",
    leadingIcon: "IconLink",
  });

export const embedConfigSchema = z.object({
  ...sectionHeaderFields({ sectionLabelDefault: "Media" }),
  embedUrl: embedUrlSchema,
  embedCode: field.textarea("埋め込みコード", { maxLength: 10000 }),
  aspectRatio: field.select("アスペクト比", {
    options: aspectRatios,
    default: "16:9",
    group: "design",
  }),
  borderRadius: field.select("角丸", {
    options: borderRadii,
    default: "sm",
    group: "design",
  }),
  layout: sectionLayoutSchema,
});

export type EmbedConfig = z.infer<typeof embedConfigSchema>;
